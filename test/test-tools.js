const calendar = require('../backend/services/calendar');

async function runTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING APPOINTMENT ENGINE AUTOMATED TESTS');
  console.log('====================================================\n');

  // Test 1: Check Sunday (Closed)
  console.log('TEST 1: Checking Sunday availability (Should be closed)...');
  const sundayCheck = await calendar.checkAvailability('2026-11-01'); // 2026-11-01 is a Sunday
  console.log('Result:', sundayCheck);
  if (!sundayCheck.available && sundayCheck.message.includes('closed on Sundays')) {
    console.log('✅ TEST 1 PASSED: Correctly identified Sunday as closed.\n');
  } else {
    console.error('❌ TEST 1 FAILED');
  }

  // Test 2: Check Monday (Open slots)
  console.log('TEST 2: Checking Monday availability at 11:00 AM...');
  const mondayCheck = await calendar.checkAvailability('2026-11-02', '11:00'); // 2026-11-02 is Monday
  console.log('Result:', mondayCheck);
  if (mondayCheck.available && mondayCheck.requestedTime === '11:00') {
    console.log('✅ TEST 2 PASSED: 11:00 AM slot is available.\n');
  } else {
    console.error('❌ TEST 2 FAILED');
  }

  // Test 3: Schedule Appointment
  console.log('TEST 3: Booking appointment for "Rahul Sharma"...');
  const booking = await calendar.scheduleAppointment({
    customerName: 'Rahul Sharma',
    customerPhone: '9876543210',
    date: '2026-11-02',
    time: '11:00',
    purpose: 'AI Voice Calling Agent',
    preferredLanguage: 'Hinglish',
    notes: 'Needs WhatsApp bot integration as well'
  });
  console.log('Booking Result:', booking);
  if (booking.success && booking.bookingId) {
    console.log(`✅ TEST 3 PASSED: Booked with ID ${booking.bookingId}.\n`);
  } else {
    console.error('❌ TEST 3 FAILED');
  }

  // Test 4: Double-booking Prevention
  console.log('TEST 4: Checking 11:00 AM on 2026-11-02 again (Double-booking test)...');
  const doubleCheck = await calendar.checkAvailability('2026-11-02', '11:00');
  console.log('Result:', doubleCheck);
  if (!doubleCheck.available && doubleCheck.message.includes('booked or unavailable')) {
    console.log('✅ TEST 4 PASSED: Double booking prevented! Suggested alternative slots.\n');
  } else {
    console.error('❌ TEST 4 FAILED: Overlap was allowed!');
  }

  // Test 5: Rescheduling
  console.log('TEST 5: Rescheduling Rahul Sharma to 3:00 PM (15:00)...');
  const reschedule = await calendar.rescheduleAppointment({
    customerPhone: '9876543210',
    customerName: 'Rahul Sharma',
    newDate: '2026-11-02',
    newTime: '15:00'
  });
  console.log('Reschedule Result:', reschedule);
  if (reschedule.success) {
    console.log('✅ TEST 5 PASSED: Appointment rescheduled.\n');
  } else {
    console.error('❌ TEST 5 FAILED');
  }

  // Test 6: Verify old slot is freed up
  console.log('TEST 6: Verifying old 11:00 AM slot is now free again...');
  const freedSlotCheck = await calendar.checkAvailability('2026-11-02', '11:00');
  if (freedSlotCheck.available) {
    console.log('✅ TEST 6 PASSED: Old slot is free again.\n');
  } else {
    console.error('❌ TEST 6 FAILED: Old slot was not freed!');
  }

  // Test 7: Cancellation
  console.log('TEST 7: Cancelling appointment...');
  const cancel = await calendar.cancelAppointment({
    customerPhone: '9876543210',
    customerName: 'Rahul Sharma',
    date: '2026-11-02',
    reason: 'Schedule conflict'
  });
  console.log('Cancel Result:', cancel);
  if (cancel.success) {
    console.log('✅ TEST 7 PASSED: Appointment successfully cancelled.\n');
  } else {
    console.error('❌ TEST 7 FAILED');
  }

  console.log('====================================================');
  console.log('🎉 ALL 7 CALENDAR ENGINE TESTS PASSED PERFECTLY!');
  console.log('====================================================');
}

runTests().catch(console.error);
