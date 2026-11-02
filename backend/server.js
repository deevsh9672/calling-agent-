require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');
const localtunnel = require('localtunnel');
const calendar = require('./services/calendar');

const app = express();
const PORT = process.env.PORT || 3000;
const VAPI_KEY = process.env.VAPI_API_KEY || '52d8b98b-94eb-486b-98ba-4a8c6346cb77';
const ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID || '884f40bc-cab3-4014-af2a-1470927a248e';
const PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID || '87470bb4-f735-4c17-a333-b77a680d1b2f';

app.use(cors());
app.use(express.json());

// Serve Static Frontend CRM
app.use(express.static(path.join(__dirname, '../public')));

// Call logs store
const CALL_LOGS_FILE = path.join(__dirname, '../call-logs.json');

function saveCallLog(callReport) {
  try {
    let logs = [];
    if (fs.existsSync(CALL_LOGS_FILE)) {
      logs = JSON.parse(fs.readFileSync(CALL_LOGS_FILE, 'utf-8'));
    }
    logs.unshift({
      callId: callReport.call?.id || callReport.id,
      startedAt: callReport.startedAt,
      endedAt: callReport.endedAt,
      durationMinutes: callReport.durationMinutes || (callReport.durationSeconds ? (callReport.durationSeconds / 60).toFixed(2) : 0),
      cost: callReport.cost,
      costINR: callReport.cost ? (callReport.cost * 86).toFixed(2) : '0.00',
      summary: callReport.summary,
      transcript: callReport.transcript,
      recordingUrl: callReport.recordingUrl,
      loggedAt: new Date().toISOString()
    });
    fs.writeFileSync(CALL_LOGS_FILE, JSON.stringify(logs.slice(0, 50), null, 2));
  } catch (err) {
    console.error('Error saving call log:', err);
  }
}

// Helper to query Vapi API
function queryVapi(endpoint, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const payload = data ? JSON.stringify(data) : null;
    const req = https.request({
      hostname: 'api.vapi.ai',
      path: endpoint,
      method: method,
      headers: {
        'Authorization': `Bearer ${VAPI_KEY}`,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch(e) {
          resolve(body);
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// CRM API: Get Live Calls with Audio Recordings and Transcripts
app.get('/api/crm/calls', async (req, res) => {
  try {
    const vapiCalls = await queryVapi('/call?limit=50', 'GET');
    if (!Array.isArray(vapiCalls)) {
      return res.json([]);
    }

    const formatted = vapiCalls.map(c => {
      let custName = c.customer?.name;
      if (!custName) {
        if (c.customer?.number === '+919509524262' || c.customer?.number === '+919672520211') {
          custName = 'Devesh ji';
        } else {
          custName = 'Customer';
        }
      }

      return {
        id: c.id,
        customerName: custName,
        customerPhone: c.customer?.number,
        type: c.type,
        status: c.status,
        durationSeconds: c.durationSeconds,
        durationMinutes: c.durationMinutes,
        cost: c.cost,
        createdAt: c.createdAt,
        startedAt: c.startedAt,
        recordingUrl: c.recordingUrl || c.artifact?.recordingUrl || c.stereoRecordingUrl,
        transcript: c.transcript,
        messages: c.messages,
        summary: c.summary || c.analysis?.summary
      };
    });

    res.json(formatted);
  } catch (err) {
    console.error('Error fetching CRM calls:', err);
    res.status(500).json({ error: 'Failed to fetch calls from Vapi' });
  }
});

// CRM API: Get Appointments
app.get('/api/crm/appointments', (req, res) => {
  res.json(calendar.loadLocalStore());
});

// CRM API: Trigger Outbound Call from Dashboard
app.post('/api/crm/call', async (req, res) => {
  const { phone, name } = req.body;
  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  try {
    const payload = {
      phoneNumberId: PHONE_NUMBER_ID,
      assistantId: ASSISTANT_ID,
      customer: {
        number: phone,
        name: name || 'Devesh ji'
      }
    };

    const callResult = await queryVapi('/call/phone', 'POST', payload);
    if (callResult.id) {
      res.json({ success: true, callId: callResult.id });
    } else {
      res.status(400).json({ success: false, error: callResult.message || 'Call failed' });
    }
  } catch (err) {
    console.error('Error initiating call:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// CRM Route Alias
app.get('/crm', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    service: 'bhsoft.solutions AI Appointment Webhook Server',
    agent: 'Hindi English Appointment Booking Agent',
    timezone: 'Asia/Kolkata',
    currentTime: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    appointmentsCount: calendar.loadLocalStore().appointments.length
  });
});

// Main Vapi Webhook Endpoint (Function Calling & End-of-Call Reports)
app.post('/api/vapi/webhook', async (req, res) => {
  const message = req.body?.message;

  if (!message) {
    return res.status(400).json({ error: 'No message in payload' });
  }

  console.log(`[VAPI EVENT] Type: ${message.type}`);

  // 1. Tool Calls Handling
  if (message.type === 'tool-calls') {
    const toolCalls = message.toolCalls || [];
    const results = [];

    for (const tc of toolCalls) {
      const funcName = tc.function?.name;
      let args = tc.function?.arguments;
      if (typeof args === 'string') {
        try { args = JSON.parse(args); } catch (e) { args = {}; }
      }

      console.log(`[TOOL CALL] Executing: ${funcName}`, JSON.stringify(args));
      let output = null;

      try {
        switch (funcName) {
          case 'checkAvailability':
            output = await calendar.checkAvailability(args.date, args.preferredTime);
            break;

          case 'scheduleAppointment':
            output = await calendar.scheduleAppointment({
              customerName: args.customerName,
              customerPhone: args.customerPhone,
              date: args.date,
              time: args.time,
              purpose: args.purpose,
              preferredLanguage: args.preferredLanguage,
              notes: args.notes
            });
            break;

          case 'rescheduleAppointment':
            output = await calendar.rescheduleAppointment({
              customerPhone: args.customerPhone,
              newDate: args.newDate,
              newTime: args.newTime,
              customerName: args.customerName
            });
            break;

          case 'cancelAppointment':
            output = await calendar.cancelAppointment({
              customerPhone: args.customerPhone,
              customerName: args.customerName,
              date: args.date,
              reason: args.reason
            });
            break;

          default:
            output = { error: `Function ${funcName} not recognized.` };
        }
      } catch (err) {
        console.error(`Error executing tool ${funcName}:`, err);
        output = { error: err.message };
      }

      console.log(`[TOOL RESULT] ${funcName}:`, output);
      results.push({
        toolCallId: tc.id,
        result: typeof output === 'string' ? output : JSON.stringify(output)
      });
    }

    return res.json({ results });
  }

  // 2. End-of-call report (duration, cost audit, transcript)
  if (message.type === 'end-of-call-report') {
    console.log('[CALL COMPLETED] Summary:', message.summary);
    console.log(`[COST AUDIT] USD: $${message.cost || 0} | INR: ₹${((message.cost || 0) * 86).toFixed(2)}`);
    saveCallLog(message);
    return res.json({ status: 'ok' });
  }

  res.json({ status: 'received' });
});

// Helper to update Vapi assistant and tools with live URL
function updateVapiWebhook(webhookUrl) {
  const reqData = JSON.stringify({
    serverUrl: webhookUrl,
    serverUrlSecret: 'bhsoft_secret'
  });

  // 1. Update Assistant
  const req1 = https.request({
    hostname: 'api.vapi.ai',
    path: `/assistant/${ASSISTANT_ID}`,
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${VAPI_KEY}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(reqData)
    }
  }, res => {
    res.on('data', () => {});
    res.on('end', () => console.log(`[VAPI SYNC] Assistant serverUrl updated to: ${webhookUrl}`));
  });
  req1.on('error', err => console.error('[VAPI SYNC ERROR]', err.message));
  req1.write(reqData);
  req1.end();

  // 2. Update Tools
  const getTools = https.request({
    hostname: 'api.vapi.ai',
    path: '/tool',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${VAPI_KEY}` }
  }, res => {
    let b = '';
    res.on('data', d => b += d);
    res.on('end', () => {
      try {
        const tools = JSON.parse(b);
        for (const t of tools) {
          if (t.type === 'function') {
            const toolPayload = JSON.stringify({
              server: {
                url: webhookUrl,
                headers: { 'Bypass-Tunnel-Reminder': 'true' }
              }
            });
            const tReq = https.request({
              hostname: 'api.vapi.ai',
              path: `/tool/${t.id}`,
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${VAPI_KEY}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(toolPayload)
              }
            });
            tReq.on('error', () => {});
            tReq.write(toolPayload);
            tReq.end();
          }
        }
      } catch (e) {}
    });
  });
  getTools.on('error', () => {});
  getTools.end();
}

// Resilient Tunnel with Keep-Alive Heartbeat
let activeTunnel = null;
async function initTunnel() {
  try {
    console.log('[TUNNEL] Connecting localtunnel...');
    activeTunnel = await localtunnel({ port: PORT, subdomain: 'bhsoft-voice-webhook' });
    const fullUrl = `${activeTunnel.url}/api/vapi/webhook`;
    console.log(`[TUNNEL] Live Public URL: ${activeTunnel.url}`);
    console.log(`[TUNNEL] Webhook Endpoint: ${fullUrl}`);

    updateVapiWebhook(fullUrl);

    activeTunnel.on('close', () => {
      console.warn('[TUNNEL] Connection closed. Auto-reconnecting in 3s...');
      setTimeout(initTunnel, 3000);
    });

    activeTunnel.on('error', (err) => {
      console.error('[TUNNEL] Error:', err.message);
      try { activeTunnel.close(); } catch (e) {}
      setTimeout(initTunnel, 3000);
    });
  } catch (err) {
    console.error('[TUNNEL] Init error:', err.message);
    setTimeout(initTunnel, 5000);
  }
}

// Keep-alive heartbeat ping every 25 seconds
setInterval(() => {
  if (activeTunnel && activeTunnel.url) {
    https.get(`${activeTunnel.url}/api/health`, { headers: { 'Bypass-Tunnel-Reminder': 'true' } }, (res) => {
      res.on('data', () => {});
    }).on('error', () => {});
  }
}, 25000);

app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`🚀 bhsoft.solutions AI CRM & Webhook Server`);
  console.log(`📡 Local Port: http://localhost:${PORT}`);
  console.log(`📊 CRM Dashboard: http://localhost:${PORT}/crm`);
  console.log(`📅 Timezone: Asia/Kolkata`);
  console.log(`=================================================`);

  initTunnel();
});
