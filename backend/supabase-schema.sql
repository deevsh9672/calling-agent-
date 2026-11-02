-- Supabase Database Schema for bhsoft.solutions AI Appointment Booking Voice Agent
-- Paste this script into your Supabase project's SQL Editor (Dashboard -> SQL Editor -> New Query)

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Customers Table
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    language VARCHAR(20) DEFAULT 'Hinglish',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Appointments Table
CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    customer_name TEXT,
    customer_phone VARCHAR(20),
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    purpose TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'confirmed', -- confirmed, rescheduled, cancelled
    calendar_event_id TEXT,
    booking_id VARCHAR(30) UNIQUE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Calls Table
CREATE TABLE IF NOT EXISTS calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vapi_call_id TEXT UNIQUE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    customer_phone VARCHAR(20),
    call_type VARCHAR(20) DEFAULT 'inbound', -- inbound, outbound, webCall
    call_status VARCHAR(20),
    duration_seconds NUMERIC(10, 2),
    transcript TEXT,
    summary TEXT,
    total_cost_usd NUMERIC(10, 4),
    total_cost_inr NUMERIC(10, 2),
    recording_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for lightning fast lookups
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_phone ON appointments(customer_phone);
CREATE INDEX IF NOT EXISTS idx_calls_vapi_id ON calls(vapi_call_id);
