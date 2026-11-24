const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

// Timezone: Asia/Kolkata
const TIMEZONE = 'Asia/Kolkata';

// Clinic Timings:
// Morning: 10:00 AM - 2:00 PM (10:00 to 14:00)
// Evening: 5:00 PM - 8:00 PM (17:00 to 20:00)
// Sunday: Closed
const SLOT_DURATION_MINUTES = 20;

// Local fallback store file for seamless zero-config testing
const LOCAL_STORE_FILE = path.join(__dirname, '../../appointments-store.json');

function loadLocalStore() {
  try {
    if (fs.existsSync(LOCAL_STORE_FILE)) {
      return JSON.parse(fs.readFileSync(LOCAL_STORE_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Error reading local store:', err);
  }
  return { appointments: [] };
}

function saveLocalStore(data) {
  try {
    fs.writeFileSync(LOCAL_STORE_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error writing local store:', err);
  }
}

// Google Calendar Client Setup (Service Account or API Key)
function getGoogleCalendarClient() {
  const serviceAccountPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

  if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
    try {
      const auth = new google.auth.GoogleAuth({
        keyFile: serviceAccountPath,
        scopes: ['https://www.googleapis.com/auth/calendar']
      });
      return { client: google.calendar({ version: 'v3', auth }), calendarId };
    } catch (err) {
      console.warn('Google Calendar auth failed, using local store:', err.message);
    }
  }
  return null;
}

/**
 * Generate standard 20-min slots for Sharma Multispeciality Clinic:
 * Morning: 10:00 AM - 02:00 PM (10:00 to 14:00)
 * Evening: 05:00 PM - 08:00 PM (17:00 to 20:00)
 */
function getStandardDailySlots(dateStr) {
  const morningShifts = [
    '10:00', '10:20', '10:40',
    '11:00', '11:20', '11:40',
    '12:00', '12:20', '12:40',
    '13:00', '13:20', '13:40'
  ];

  const eveningShifts = [
    '17:00', '17:20', '17:40',
    '18:00', '18:20', '18:40',
    '19:00', '19:20', '19:40'
  ];

  return [...morningShifts, ...eveningShifts];
}

/**
 * Normalize Date strings dynamically (handles "today", "tomorrow", "monday", 2024->2026 fixes, etc.)
 */
function normalizeDate(rawDate) {
  const now = new Date();
  const kolkataDateStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
  const baseDate = new Date(kolkataDateStr + 'T00:00:00+05:30');

  if (!rawDate) return kolkataDateStr;
  let str = rawDate.toString().trim().toLowerCase();

  const dayOfWeek = baseDate.getDay(); // 0 is Sunday, 1 is Monday...

  if (str === 'today' || str === 'aaj') return kolkataDateStr;
  if (str === 'tomorrow' || str === 'kal') {
    const tm = new Date(baseDate.getTime() + 24 * 60 * 60 * 1000);
    return tm.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  }

  const daysMap = {
    'sunday': 0, 'raviwar': 0,
    'monday': 1, 'somwar': 1, 'somvaar': 1,
    'tuesday': 2, 'mangalwar': 2, 'mangalvaar': 2,
    'wednesday': 3, 'budhwar': 3, 'budhvaar': 3,
    'thursday': 4, 'guruwar': 4, 'veervaar': 4,
    'friday': 5, 'shukrawar': 5, 'shukrvaar': 5,
    'saturday': 6, 'shaniwar': 6, 'shanivaar': 6
  };

  for (const [dayName, targetDay] of Object.entries(daysMap)) {
    if (str.includes(dayName)) {
      let diff = targetDay - dayOfWeek;
      if (diff < 0) diff += 7; // Next occurrence
      if (diff === 0 && (str.includes('next') || str.includes('agle'))) diff = 7;
      const target = new Date(baseDate.getTime() + diff * 24 * 60 * 60 * 1000);
      return target.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    }
  }

  // Fix 2024 or 2025 hallucinated years to 2026
  const parts = str.split('-');
  if (parts.length === 3) {
    let y = parseInt(parts[0], 10);
    let m = parts[1].padStart(2, '0');
    let d = parts[2].padStart(2, '0');
    if (y < 2026) y = 2026;
    return `${y}-${m}-${d}`;
  }

  return str;
}

/**
 * Normalize Time strings (handles "11 AM", "11", "5 PM", "17:00", etc.)
 */
function normalizeTime(rawTime) {
  if (!rawTime) return null;
  let str = rawTime.toString().trim().toLowerCase();

  if (str.includes('pm') || str.includes('sham') || str.includes('shaam')) {
    const num = parseInt(str.replace(/[^0-9]/g, ''), 10);
    if (num < 12) {
      return `${(num + 12).toString().padStart(2, '0')}:00`;
    }
  }
  if (str.includes('am') || str.includes('subah')) {
    const num = parseInt(str.replace(/[^0-9]/g, ''), 10);
    return `${num.toString().padStart(2, '0')}:00`;
  }

  const timeMatch = str.match(/(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    return `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
  }

  const digitOnly = parseInt(str.replace(/[^0-9]/g, ''), 10);
  if (!isNaN(digitOnly) && digitOnly >= 1 && digitOnly <= 24) {
    if (digitOnly >= 1 && digitOnly <= 4) {
      return `${(digitOnly + 12).toString().padStart(2, '0')}:00`;
    }
    if (digitOnly >= 5 && digitOnly <= 8) {
      return `${(digitOnly + 12).toString().padStart(2, '0')}:00`;
    }
    return `${digitOnly.toString().padStart(2, '0')}:00`;
  }

  return rawTime;
}

/**
 * Check Availability for a date and optional preferred time
 */
async function checkAvailability(rawDateStr, rawPreferredTime = null) {
  const dateStr = normalizeDate(rawDateStr);
  const preferredTime = normalizeTime(rawPreferredTime);

  const targetDate = new Date(dateStr + 'T00:00:00+05:30');
  const dayOfWeek = targetDate.getDay(); // 0 is Sunday

  if (dayOfWeek === 0) {
    return {
      available: false,
      date: dateStr,
      message: 'Sharma Multispeciality Clinic is closed on Sundays. Clinic timings are Monday to Saturday: Morning 10:00 AM to 2:00 PM, and Evening 5:00 PM to 8:00 PM IST.',
      availableSlots: []
    };
  }

  const gcal = getGoogleCalendarClient();
  let busyTimes = [];

  if (gcal) {
    try {
      const timeMin = new Date(`${dateStr}T10:00:00+05:30`).toISOString();
      const timeMax = new Date(`${dateStr}T20:00:00+05:30`).toISOString();

      const response = await gcal.client.freebusy.query({
        requestBody: {
          timeMin,
          timeMax,
          timeZone: TIMEZONE,
          items: [{ id: gcal.calendarId }]
        }
      });
      const busy = response.data.calendars[gcal.calendarId]?.busy || [];
      busyTimes = busy.map(b => ({
        start: new Date(b.start),
        end: new Date(b.end)
      }));
    } catch (err) {
      console.error('Google Calendar query error:', err.message);
    }
  }

  // Also query local store
  const store = loadLocalStore();
  const localAppointments = store.appointments.filter(a => a.date === dateStr && a.status !== 'cancelled');
  for (const app of localAppointments) {
    const start = new Date(`${app.date}T${app.time}:00+05:30`);
    const end = new Date(start.getTime() + SLOT_DURATION_MINUTES * 60000);
    busyTimes.push({ start, end });
  }

  const allSlots = getStandardDailySlots(dateStr);
  const freeSlots = [];

  for (const slot of allSlots) {
    const slotStart = new Date(`${dateStr}T${slot}:00+05:30`);
    const slotEnd = new Date(slotStart.getTime() + SLOT_DURATION_MINUTES * 60000);

    const isOverlap = busyTimes.some(b => slotStart < b.end && slotEnd > b.start);
    if (!isOverlap) {
      freeSlots.push(slot);
    }
  }

  if (preferredTime) {
    let normTime = preferredTime.trim();
    if (normTime.length === 4 && normTime[1] === ':') normTime = '0' + normTime;

    const isPreferredAvailable = freeSlots.includes(normTime);
    if (isPreferredAvailable) {
      return {
        available: true,
        date: dateStr,
        requestedTime: normTime,
        message: `The slot at ${normTime} on ${dateStr} with Dr. Pankaj Sharma is available.`,
        availableSlots: freeSlots.slice(0, 4)
      };
    } else {
      return {
        available: false,
        date: dateStr,
        requestedTime: normTime,
        message: `The requested slot at ${normTime} is currently booked or outside clinic hours (Morning 10 AM-2 PM, Evening 5 PM-8 PM). Alternative available slots on ${dateStr}: ${freeSlots.slice(0, 3).join(', ')}.`,
        availableSlots: freeSlots.slice(0, 4)
      };
    }
  }

  return {
    available: freeSlots.length > 0,
    date: dateStr,
    message: `Available appointment slots for Dr. Pankaj Sharma on ${dateStr} are: ${freeSlots.slice(0, 4).join(', ')}.`,
    availableSlots: freeSlots.slice(0, 5)
  };
}

/**
 * Schedule Appointment in Google Calendar and Local Store
 */
async function scheduleAppointment({ customerName, customerPhone, date, time, purpose, preferredLanguage, notes, patientType }) {
  const normDate = normalizeDate(date);
  const normTime = normalizeTime(time) || '11:00';
  const bookingId = 'SMC-' + Date.now().toString(36).toUpperCase();
  const startDateTime = `${normDate}T${normTime}:00+05:30`;
  const startTime = new Date(startDateTime);
  const endTime = new Date(startTime.getTime() + SLOT_DURATION_MINUTES * 60000);

  let gcalEventId = null;
  const gcal = getGoogleCalendarClient();

  if (gcal) {
    try {
      const eventRes = await gcal.client.events.insert({
        calendarId: gcal.calendarId,
        requestBody: {
          summary: `Dr. Pankaj Sharma - Patient: ${customerName} (${purpose || 'General Consultation'})`,
          description: `Patient Name: ${customerName}\nPhone: ${customerPhone}\nConcern: ${purpose || 'Health Consultation'}\nType: ${patientType || 'New Patient'}\nFee: ₹500 (Free follow-up within 7 days)\nNotes: ${notes || 'None'}\nBooking ID: ${bookingId}`,
          start: { dateTime: startTime.toISOString(), timeZone: TIMEZONE },
          end: { dateTime: endTime.toISOString(), timeZone: TIMEZONE }
        }
      });
      gcalEventId = eventRes.data.id;
    } catch (err) {
      console.error('Google Calendar event insert failed:', err.message);
    }
  }

  // Save to persistent local store
  const store = loadLocalStore();
  const newAppointment = {
    bookingId,
    customerName,
    customerPhone,
    date: normDate,
    time: normTime,
    purpose: purpose || 'General Consultation',
    patientType: patientType || 'New Patient',
    fee: '₹500',
    preferredLanguage: preferredLanguage || 'Hinglish',
    notes: notes || '',
    calendarEventId: gcalEventId,
    status: 'confirmed',
    clinicName: 'Sharma Multispeciality Clinic',
    doctor: 'Dr. Pankaj Sharma (MD General Medicine)',
    createdAt: new Date().toISOString()
  };
  store.appointments.push(newAppointment);
  saveLocalStore(store);

  return {
    success: true,
    bookingId,
    customerName,
    customerPhone,
    date: normDate,
    time: normTime,
    purpose: purpose || 'General Consultation',
    doctor: 'Dr. Pankaj Sharma',
    fee: '₹500 (Consultation fee, Pay at clinic via UPI/Cash/Card)',
    message: `Appointment successfully booked for ${customerName} with Dr. Pankaj Sharma on ${normDate} at ${normTime}. Booking ID: ${bookingId}. Consultation fee is ₹500 (Free follow-up within 7 days).`
  };
}

/**
 * Reschedule existing appointment
 */
async function rescheduleAppointment({ customerPhone, newDate, newTime, customerName }) {
  const store = loadLocalStore();
  const app = store.appointments.find(a => 
    (a.customerPhone === customerPhone || (customerName && a.customerName.toLowerCase() === customerName.toLowerCase())) &&
    a.status === 'confirmed'
  );

  if (!app) {
    return {
      success: false,
      message: `No active appointment found for phone number ${customerPhone} at Sharma Multispeciality Clinic. Please verify your details.`
    };
  }

  const check = await checkAvailability(newDate, newTime);
  if (!check.available) {
    return {
      success: false,
      message: `The requested time ${newTime} on ${newDate} is not available. Alternatives: ${check.availableSlots.join(', ')}`
    };
  }

  app.oldDate = app.date;
  app.oldTime = app.time;
  app.date = newDate;
  app.time = newTime;
  app.updatedAt = new Date().toISOString();
  saveLocalStore(store);

  const gcal = getGoogleCalendarClient();
  if (gcal && app.calendarEventId) {
    try {
      const startTime = new Date(`${newDate}T${newTime}:00+05:30`);
      const endTime = new Date(startTime.getTime() + SLOT_DURATION_MINUTES * 60000);
      await gcal.client.events.patch({
        calendarId: gcal.calendarId,
        eventId: app.calendarEventId,
        requestBody: {
          start: { dateTime: startTime.toISOString(), timeZone: TIMEZONE },
          end: { dateTime: endTime.toISOString(), timeZone: TIMEZONE }
        }
      });
    } catch (err) {
      console.error('Google Calendar event patch failed:', err.message);
    }
  }

  return {
    success: true,
    bookingId: app.bookingId,
    date: newDate,
    time: newTime,
    message: `Appointment successfully rescheduled with Dr. Pankaj Sharma to ${newDate} at ${newTime}.`
  };
}

/**
 * Cancel existing appointment
 */
async function cancelAppointment({ customerPhone, customerName, date, reason }) {
  const store = loadLocalStore();
  const app = store.appointments.find(a => 
    a.customerPhone === customerPhone &&
    a.status === 'confirmed' &&
    (!date || a.date === date)
  );

  if (!app) {
    return {
      success: false,
      message: `No active appointment found for phone number ${customerPhone} to cancel.`
    };
  }

  app.status = 'cancelled';
  app.cancellationReason = reason || 'Patient requested';
  app.cancelledAt = new Date().toISOString();
  saveLocalStore(store);

  const gcal = getGoogleCalendarClient();
  if (gcal && app.calendarEventId) {
    try {
      await gcal.client.events.delete({
        calendarId: gcal.calendarId,
        eventId: app.calendarEventId
      });
    } catch (err) {
      console.error('Google Calendar event delete failed:', err.message);
    }
  }

  return {
    success: true,
    bookingId: app.bookingId,
    message: `Your appointment with Dr. Pankaj Sharma on ${app.date} at ${app.time} has been successfully cancelled.`
  };
}

module.exports = {
  checkAvailability,
  scheduleAppointment,
  rescheduleAppointment,
  cancelAppointment,
  loadLocalStore
};
