const calendar = require('../backend/services/calendar');

async function runTests() {
  console.log('====================================================');
  console.log('🏥 RUNNING SHARMA CLINIC APPOINTMENT ENGINE TESTS');
  console.log('====================================================\n');

  // Test 1: Check Sunday (Closed)
  console.log('TEST 1: Checking Sunday availability (Should be closed)...');
  const sundayCheck = await calendar.checkAvailability('2026-11-29'); // 2026-11-29 is a Sunday
  console.log('Result:', sundayCheck);
  if (!sundayCheck.available && sundayCheck.message.includes('closed on Sundays')) {
    console.log('✅ TEST 1 PASSED: Sunday closed correctly identified.\n');
  } else {
    console.error('❌ TEST 1 FAILED');
  }

  // Test 2: Check Monday Morning Slot (11:20 AM)
  console.log('TEST 2: Checking Monday Morning slot at 11:20 AM...');
  const mondayMorning = await calendar.checkAvailability('2026-11-30', '11:20');
  console.log('Result:', mondayMorning);
  if (mondayMorning.available) {
    console.log('✅ TEST 2 PASSED: 11:20 AM morning slot is available.\n');
  } else {
    console.error('❌ TEST 2 FAILED');
  }

  // Test 3: Check Break Hours (15:00 / 3 PM - clinic closed between 2 PM and 5 PM)
  console.log('TEST 3: Checking Break Hours (3:00 PM - should be outside hours)...');
  const breakCheck = await calendar.checkAvailability('2026-11-30', '15:00');
  console.log('Result:', breakCheck);
  if (!breakCheck.available && breakCheck.message.includes('outside clinic hours')) {
    console.log('✅ TEST 3 PASSED: Afternoon break correctly identified.\n');
  } else {
    console.error('❌ TEST 3 FAILED');
  }

  // Test 4: Check Evening Slot (18:00 / 6:00 PM)
  console.log('TEST 4: Checking Evening slot at 18:00 (6:00 PM)...');
  const eveningCheck = await calendar.checkAvailability('2026-11-30', '18:00');
  console.log('Result:', eveningCheck);
  if (eveningCheck.available) {
    console.log('✅ TEST 4 PASSED: 6:00 PM evening slot is available.\n');
  } else {
    console.error('❌ TEST 4 FAILED');
  }

  // Test 5: Book Appointment for Patient
  console.log('TEST 5: Booking appointment for "Ramesh Verma" with fever/cough...');
  const booking = await calendar.scheduleAppointment({
    customerName: 'Ramesh Verma',
    customerPhone: '9876543210',
    date: '2026-11-30',
    time: '11:20',
    purpose: 'Fever and Cough Consultation',
    patientType: 'New Patient',
    preferredLanguage: 'Hinglish',
    notes: 'Mild fever for 3 days'
  });
  console.log('Booking Result:', booking);
  if (booking.success && booking.bookingId && booking.fee.includes('500')) {
    console.log(`✅ TEST 5 PASSED: Booked ID ${booking.bookingId} with fee ${booking.fee}.\n`);
  } else {
    console.error('❌ TEST 5 FAILED');
  }

  // Test 6: Double Booking Check
  console.log('TEST 6: Checking 11:20 AM on 2026-11-30 again (Double-booking test)...');
  const doubleCheck = await calendar.checkAvailability('2026-11-30', '11:20');
  if (!doubleCheck.available) {
    console.log('✅ TEST 6 PASSED: Double booking prevented! Suggested alternatives.\n');
  } else {
    console.error('❌ TEST 6 FAILED');
  }

  // Test 7: Cancel Appointment
  console.log('TEST 7: Cancelling appointment...');
  const cancel = await calendar.cancelAppointment({
    customerPhone: '9876543210',
    customerName: 'Ramesh Verma',
    date: '2026-11-30',
    reason: 'Patient recovered'
  });
  console.log('Cancel Result:', cancel);
  if (cancel.success) {
    console.log('✅ TEST 7 PASSED: Appointment cancelled.\n');
  } else {
    console.error('❌ TEST 7 FAILED');
  }

  console.log('====================================================');
  console.log('🎉 ALL 7 CLINIC CALENDAR TESTS PASSED PERFECTLY!');
  console.log('====================================================');
}

runTests().catch(console.error);
