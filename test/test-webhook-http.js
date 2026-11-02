const http = require('http');

const testPayload = {
  message: {
    type: 'tool-calls',
    toolCalls: [
      {
        id: 'call_test_check_01',
        type: 'function',
        function: {
          name: 'checkAvailability',
          arguments: {
            date: '2026-11-03',
            preferredTime: '14:00'
          }
        }
      }
    ]
  }
};

const data = JSON.stringify(testPayload);

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/vapi/webhook',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
}, res => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('HTTP Status:', res.statusCode);
    console.log('Webhook Response:');
    console.log(JSON.stringify(JSON.parse(body), null, 2));
  });
});

req.on('error', console.error);
req.write(data);
req.end();
