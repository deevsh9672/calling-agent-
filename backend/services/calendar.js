const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

// Timezone: Asia/Kolkata
const TIMEZONE = 'Asia/Kolkata';
const BUSINESS_START_HOUR = 10; // 10:00 AM IST
const BUSINESS_END_HOUR = 19;   // 7:00 PM IST
const SLOT_DURATION_MINUTES = 30;

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
 * Generate standard 30-min slots for a given day (10:00 AM to 7:00 PM)
 */
function getStandardDailySlots(dateStr) {
  const slots = [];
  for (let hour = BUSINESS_START_HOUR; hour < BUSINESS_END_HOUR; hour++) {
    for (let min of [0, 30]) {
      const hStr = hour.toString().padStart(2, '0');
      const mStr = min.toString().padStart(2, '0');
      slots.push(`${hStr}:${mStr}`);
    }
  }
  return slots;
}

/**
 * Check Availability for a date and optional preferred time
 */
async function checkAvailability(dateStr, preferredTime = null) {
  const targetDate = new Date(dateStr + 'T00:00:00+05:30');
  const dayOfWeek = targetDate.getDay(); // 0 is Sunday

  if (dayOfWeek === 0) {
    return {
      available: false,
      message: 'bhsoft.solutions is closed on Sundays. Please choose Monday through Saturday between 10:00 AM and 7:00 PM IST.',
      availableSlots: []
    };
  }

  const gcal = getGoogleCalendarClient();
  let busyTimes = [];

  if (gcal) {
    try {
      const timeMin = new Date(`${dateStr}T${BUSINESS_START_HOUR.toString().padStart(2, '0')}:00:00+05:30`).toISOString();
      const timeMax = new Date(`${dateStr}T${BUSINESS_END_HOUR.toString().padStart(2, '0')}:00:00+05:30`).toISOString();

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
    // Normalize format like "3:00 PM" or "15:00"
    let normTime = preferredTime.trim();
    if (normTime.length === 4 && normTime[1] === ':') normTime = '0' + normTime;

    const isPreferredAvailable = freeSlots.includes(normTime);
    if (isPreferredAvailable) {
      return {
        available: true,
        date: dateStr,
        requestedTime: normTime,
        message: `The slot at ${normTime} on ${dateStr} is available.`,
        availableSlots: freeSlots.slice(0, 4)
      };
    } else {
      return {
        available: false,
        date: dateStr,
        requestedTime: normTime,
        message: `The slot at ${normTime} is currently booked or unavailable. Alternative available slots on ${dateStr}: ${freeSlots.slice(0, 3).join(', ')}.`,
        availableSlots: freeSlots.slice(0, 4)
      };
    }
  }

  return {
    available: freeSlots.length > 0,
    date: dateStr,
    message: `Available slots for ${dateStr} are: ${freeSlots.slice(0, 4).join(', ')}.`,
    availableSlots: freeSlots.slice(0, 5)
  };
}

/**
 * Schedule Appointment in Google Calendar and Local Store
 */
async function scheduleAppointment({ customerName, customerPhone, date, time, purpose, preferredLanguage, notes }) {
  const bookingId = 'BH-' + Date.now().toString(36).toUpperCase();
  const startDateTime = `${date}T${time}:00+05:30`;
  const startTime = new Date(startDateTime);
  const endTime = new Date(startTime.getTime() + SLOT_DURATION_MINUTES * 60000);
  const endDateTime = endTime.toISOString();

  let gcalEventId = null;
  const gcal = getGoogleCalendarClient();

  if (gcal) {
    try {
      const eventRes = await gcal.client.events.insert({
        calendarId: gcal.calendarId,
        requestBody: {
          summary: `Consultation: ${customerName} (${purpose})`,
          description: `Customer Name: ${customerName}\nPhone: ${customerPhone}\nService: ${purpose}\nLanguage: ${preferredLanguage || 'Hinglish'}\nNotes: ${notes || 'None'}\nBooking ID: ${bookingId}`,
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
    date,
    time,
    purpose,
    preferredLanguage: preferredLanguage || 'Hinglish',
    notes: notes || '',
    calendarEventId: gcalEventId,
    status: 'confirmed',
    createdAt: new Date().toISOString()
  };
  store.appointments.push(newAppointment);
  saveLocalStore(store);

  return {
    success: true,
    bookingId,
    customerName,
    customerPhone,
    date,
    time,
    purpose,
    message: `Appointment successfully booked for ${customerName} on ${date} at ${time} for ${purpose}. Booking ID: ${bookingId}.`
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
      message: `No active appointment found for phone number ${customerPhone}. Please verify your details.`
    };
  }

  // Check availability of new slot
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

  // Update Google Calendar if linked
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
    message: `Appointment successfully rescheduled to ${newDate} at ${newTime}.`
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
  app.cancellationReason = reason || 'Customer requested';
  app.cancelledAt = new Date().toISOString();
  saveLocalStore(store);

  // Delete/Cancel from Google Calendar if linked
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
    message: `Your appointment on ${app.date} at ${app.time} has been successfully cancelled.`
  };
}

module.exports = {
  checkAvailability,
  scheduleAppointment,
  rescheduleAppointment,
  cancelAppointment,
  loadLocalStore
};
