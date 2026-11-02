const https = require('https');

const VAPI_KEY = '52d8b98b-94eb-486b-98ba-4a8c6346cb77';
const CALL_ID = process.argv[2] || '01a191a4-fcaf-7000-a129-b48568129674';

const options = {
  hostname: 'api.vapi.ai',
  path: `/call/${CALL_ID}`,
  headers: { 'Authorization': `Bearer ${VAPI_KEY}` }
};

https.get(options, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    try {
      const c = JSON.parse(body);
      console.log('Call ID:', c.id);
      console.log('Status:', c.status);
      console.log('Ended Reason:', c.endedReason);
      console.log('Duration:', c.durationMinutes || c.durationSeconds, 'seconds');
      console.log('Cost:', c.cost);
      console.log('\n--- TRANSCRIPT ---');
      console.log(c.transcript || 'No transcript');
      console.log('\n--- MESSAGES ---');
      if (c.messages && c.messages.length > 0) {
        c.messages.forEach(m => {
          console.log(`[${m.role}]: ${m.message || m.content || JSON.stringify(m)}`);
        });
      } else {
        console.log('No messages recorded.');
      }
    } catch(e) {
      console.log('Raw response:', body);
    }
  });
});
