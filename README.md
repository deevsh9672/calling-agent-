# 📞 BHSOFT AI Voice Calling Agent & CRM

An enterprise-ready, low-cost multilingual AI Voice Appointment Booking Receptionist and CRM dashboard built with **Vapi AI**, **Deepgram**, and **Google Calendar**.

Developed for **bhsoft.solutions** to handle real-time inbound & outbound customer voice calls in **Hindi, English, and natural Hinglish**.

---

## 🌟 Key Features

1. **Multilingual Voice AI (Hindi + English + Hinglish):**
   - Natural spoken Hinglish conversation tailored for Indian business calls.
   - Powered by Deepgram Nova-3 multilingual speech-to-text (`language: "multi"`).
   - Azure Indian Neural Voice (`hi-IN-SwaraNeural`) for realistic pronunciation.
   - Low latency with instant interruption handling.

2. **Automated Appointment Engine (Google Calendar):**
   - Real-time slot availability checking (`checkAvailability`).
   - Prevents double-booking and respects business hours (10:00 AM – 7:00 PM IST, Sundays closed).
   - Instant booking creation with unique booking IDs (`scheduleAppointment`).
   - Appointment rescheduling and cancellation support.

3. **Live Web CRM & Receptionist Dashboard:**
   - Real-time KPI metrics (total calls, talk time, costs in INR & USD, confirmed bookings).
   - Full call history with audio recordings (`.wav` player embedded).
   - Dialogue-by-dialogue interactive transcript viewer.
   - 1-Click outbound calling modal directly from the browser.
   - Customer contacts directory.

4. **Telephony Integration:**
   - Twilio active number integration for outbound dialing and inbound call routing.
   - Web voice simulator for 100% zero-telecom testing in the browser.

---

## 📁 Project Architecture

```
vapi-hindi-appointment-agent/
├── backend/
│   ├── server.js              # Express server, CRM APIs & Vapi webhook tunnel
│   ├── services/
│   │   └── calendar.js        # Google Calendar slot checking & booking engine
│   └── supabase-schema.sql    # Optional Supabase database migration
├── config/
│   ├── assistant.json         # Vapi Assistant configuration
│   ├── system-prompt-hinglish.md # Natural Hinglish sales persona prompt
│   └── tools.json             # Function calling tool definitions
├── public/
│   └── index.html             # Real-time Web CRM & Receptionist Dashboard
├── scripts/
│   └── make-outbound-call.js  # CLI trigger to place outbound AI calls
├── test/
│   ├── test-tools.js          # Automated calendar test suite (7/7 tests)
│   ├── test-webhook-http.js   # HTTP webhook simulation
│   └── setup-vapi-assistant.js# Vapi API provisioning script
├── .env.example
└── package.json
```

---

## 🚀 Quick Start Guide

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Add your credentials:
```env
VAPI_API_KEY=your_vapi_private_key
VAPI_ASSISTANT_ID=your_assistant_id
VAPI_PHONE_NUMBER_ID=your_vapi_phone_number_id
PORT=3000
```

### 3. Start the Server & CRM Dashboard
```bash
npm start
```
Open your browser at:
```
http://localhost:3000/crm
```

### 4. Trigger an Outbound Test Call
```bash
node scripts/make-outbound-call.js +919876543210 "Customer Name"
```

---

## 🧪 Automated Test Suite

Run the 7-stage calendar verification suite:
```bash
npm run test:tools
```

---

## 📜 License
MIT License. Built for **bhsoft.solutions**.
