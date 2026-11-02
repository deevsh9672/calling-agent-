const fs = require('fs');
const path = require('path');
const https = require('https');

const VAPI_KEY = process.env.VAPI_API_KEY || '52d8b98b-94eb-486b-98ba-4a8c6346cb77';
const ASSISTANT_ID = '884f40bc-cab3-4014-af2a-1470927a248e';
const SYSTEM_PROMPT = fs.readFileSync(path.join(__dirname, '../config/system-prompt.md'), 'utf-8');

function apiRequest(endpoint, method = 'GET', data = null) {
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
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject({ status: res.statusCode, body: parsed });
          }
        } catch (e) {
          resolve(body);
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const toolsDefinition = [
  {
    type: 'function',
    function: {
      name: 'checkAvailability',
      description: 'Check Google Calendar for open 30-minute appointment slots on a given date (Asia/Kolkata timezone). Always call this before promising or booking any appointment.',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'The requested appointment date in YYYY-MM-DD format (Asia/Kolkata).'
          },
          preferredTime: {
            type: 'string',
            description: 'Optional preferred time requested by caller, e.g. 15:00 or 10:30 (24-hour format).'
          }
        },
        required: ['date']
      }
    },
    server: {
      url: 'http://localhost:3000/api/vapi/webhook'
    }
  },
  {
    type: 'function',
    function: {
      name: 'scheduleAppointment',
      description: 'Book a confirmed 30-minute appointment in Google Calendar. Call this ONLY after the customer verifies their name, phone, date, and time.',
      parameters: {
        type: 'object',
        properties: {
          customerName: {
            type: 'string',
            description: 'Full name of the customer.'
          },
          customerPhone: {
            type: 'string',
            description: 'Customer 10-digit mobile phone number.'
          },
          date: {
            type: 'string',
            description: 'Appointment date in YYYY-MM-DD format.'
          },
          time: {
            type: 'string',
            description: 'Appointment start time in HH:MM format (24-hour, Asia/Kolkata).'
          },
          purpose: {
            type: 'string',
            description: 'Purpose or service requested (e.g. AI Voice Agent, Website Development, SEO consultation).'
          },
          preferredLanguage: {
            type: 'string',
            description: 'Preferred language of communication (Hindi, English, or Hinglish).'
          },
          notes: {
            type: 'string',
            description: 'Any additional notes or customer requirements.'
          }
        },
        required: ['customerName', 'customerPhone', 'date', 'time', 'purpose']
      }
    },
    server: {
      url: 'http://localhost:3000/api/vapi/webhook'
    }
  },
  {
    type: 'function',
    function: {
      name: 'rescheduleAppointment',
      description: 'Reschedule an existing appointment to a new date and time in Google Calendar.',
      parameters: {
        type: 'object',
        properties: {
          customerPhone: {
            type: 'string',
            description: 'Registered customer mobile phone number.'
          },
          customerName: {
            type: 'string',
            description: 'Customer name.'
          },
          newDate: {
            type: 'string',
            description: 'New appointment date in YYYY-MM-DD format.'
          },
          newTime: {
            type: 'string',
            description: 'New appointment time in HH:MM format (24-hour, Asia/Kolkata).'
          }
        },
        required: ['customerPhone', 'newDate', 'newTime']
      }
    },
    server: {
      url: 'http://localhost:3000/api/vapi/webhook'
    }
  },
  {
    type: 'function',
    function: {
      name: 'cancelAppointment',
      description: 'Cancel an existing appointment from Google Calendar.',
      parameters: {
        type: 'object',
        properties: {
          customerPhone: {
            type: 'string',
            description: 'Customer mobile phone number.'
          },
          customerName: {
            type: 'string',
            description: 'Customer name.'
          },
          date: {
            type: 'string',
            description: 'Scheduled date of the appointment in YYYY-MM-DD format.'
          },
          reason: {
            type: 'string',
            description: 'Reason for cancellation.'
          }
        },
        required: ['customerPhone']
      }
    },
    server: {
      url: 'http://localhost:3000/api/vapi/webhook'
    }
  }
];

async function main() {
  console.log('--- Step 1: Registering / Syncing Vapi Tools ---');
  const toolIds = [];
  
  // List existing tools
  const existingTools = await apiRequest('/tool', 'GET');
  console.log(`Found ${existingTools.length} existing tools in Vapi.`);

  for (const toolDef of toolsDefinition) {
    const existing = existingTools.find(t => t.function?.name === toolDef.function.name);
    if (existing) {
      console.log(`Tool '${toolDef.function.name}' exists (ID: ${existing.id}). Updating...`);
      await apiRequest(`/tool/${existing.id}`, 'PATCH', toolDef);
      toolIds.push(existing.id);
    } else {
      console.log(`Creating tool '${toolDef.function.name}'...`);
      const created = await apiRequest('/tool', 'POST', toolDef);
      console.log(`Created tool '${toolDef.function.name}' (ID: ${created.id})`);
      toolIds.push(created.id);
    }
  }

  // Also include the existing endCall tool if present
  const endCallTool = existingTools.find(t => t.type === 'endCall');
  if (endCallTool) {
    toolIds.push(endCallTool.id);
    console.log(`Included native endCall tool (ID: ${endCallTool.id})`);
  }

  console.log('\n--- Step 2: Updating Hindi English Appointment Booking Agent ---');
  const updatePayload = {
    name: 'Hindi English Appointment Booking Agent',
    transcriber: {
      provider: 'deepgram',
      model: 'nova-3',
      language: 'multi'
    },
    model: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      temperature: 0.2,
      maxTokens: 250,
      toolIds: toolIds,
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT
        }
      ]
    },
    voice: {
      provider: 'azure',
      voiceId: 'hi-IN-SwaraNeural'
    },
    firstMessage: 'Namaste! bhsoft.solutions mein aapka swagat hai. Main AI appointment assistant hoon. Aapki kya help kar sakta hoon?',
    firstMessageMode: 'assistant-speaks-first',
    silenceTimeoutSeconds: 30,
    maxDurationSeconds: 600,
    startSpeakingPlan: {
      waitSeconds: 0.4,
      smartEndpointingEnabled: 'livekit'
    },
    stopSpeakingPlan: {
      numWords: 1,
      voiceSeconds: 0.2,
      backoffSeconds: 1
    },
    endCallPhrases: [
      'goodbye',
      'alvida',
      'dhanyawad',
      'thank you bye',
      'have a good day'
    ]
  };

  const updatedAssistant = await apiRequest(`/assistant/${ASSISTANT_ID}`, 'PATCH', updatePayload);
  console.log(`Assistant '${updatedAssistant.name}' updated successfully!`);
  console.log(`Assistant ID: ${updatedAssistant.id}`);
  console.log(`Attached Tools count: ${updatedAssistant.model.toolIds?.length}`);
  console.log('\nReady for Phase 3: Web Voice Testing!');
}

main().catch(err => {
  console.error('Error during Vapi assistant setup:', err);
  process.exit(1);
});
