const https = require('https');
require('dotenv').config();

const VAPI_KEY = process.env.VAPI_API_KEY || '52d8b98b-94eb-486b-98ba-4a8c6346cb77';
const ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID || '884f40bc-cab3-4014-af2a-1470927a248e';
const PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID || '87470bb4-f735-4c17-a333-b77a680d1b2f';

async function makeOutboundCall(targetPhoneNumber, customerName = 'Devesh ji') {
  if (!targetPhoneNumber) {
    console.error('❌ Please provide a destination phone number with country code, e.g. +919876543210');
    process.exit(1);
  }

  console.log(`📞 Initiating Hindi outbound call to ${targetPhoneNumber} (${customerName})...`);

  // Do NOT override firstMessage so Vapi uses the exact Hindi pitch configured on the Assistant
  const payload = JSON.stringify({
    phoneNumberId: PHONE_NUMBER_ID,
    assistantId: ASSISTANT_ID,
    customer: {
      number: targetPhoneNumber,
      name: customerName
    }
  });

  const req = https.request({
    hostname: 'api.vapi.ai',
    path: '/call/phone',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${VAPI_KEY}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  }, res => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => {
      console.log(`Status: ${res.statusCode}`);
      try {
        const json = JSON.parse(body);
        if (res.statusCode === 201) {
          console.log(`✅ Call successfully initiated!`);
          console.log(`Call ID: ${json.id}`);
          console.log(`Status: ${json.status}`);
          console.log(`Monitor in Vapi Dashboard: https://dashboard.vapi.ai/calls`);
        } else {
          console.error(`❌ Call failed:`, json);
        }
      } catch (e) {
        console.log('Response:', body);
      }
    });
  });

  req.on('error', err => {
    console.error('Request error:', err);
  });

  req.write(payload);
  req.end();
}

const targetNumber = process.argv[2];
const name = process.argv[3] || 'Devesh ji';

if (require.main === module) {
  if (!targetNumber) {
    console.log('Usage: node scripts/make-outbound-call.js <PHONE_NUMBER_WITH_COUNTRY_CODE> [CUSTOMER_NAME]');
  } else {
    makeOutboundCall(targetNumber, name);
  }
}

module.exports = { makeOutboundCall };
