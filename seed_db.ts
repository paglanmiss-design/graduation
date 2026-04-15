import Database from "better-sqlite3";
import bcrypt from "bcryptjs";

const db = new Database("clinic.db");

// Initialize tables (same as server.ts)
db.exec(`
  CREATE TABLE IF NOT EXISTS patients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    age INTEGER NOT NULL,
    gender TEXT NOT NULL,
    contact_info TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS medical_records (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    diagnosis TEXT NOT NULL,
    prescription TEXT NOT NULL,
    visit_date TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id)
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    appointment_date TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'Scheduled',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id)
  );

  CREATE TABLE IF NOT EXISTS vitals (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    weight REAL,
    height REAL,
    blood_pressure TEXT,
    heart_rate INTEGER,
    temperature REAL,
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id)
  );

  CREATE TABLE IF NOT EXISTS contact_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS message_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL,
    sender TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (message_id) REFERENCES contact_messages(id)
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'admin'
  );
`);

// Seed Users
const hashedPassword = bcrypt.hashSync("admin123", 10);
db.prepare("INSERT OR IGNORE INTO users (id, username, password) VALUES (?, ?, ?)")
  .run("user-admin", "admin", hashedPassword);

// Seed Patients
const patients = [
  { id: "PAT-001", name: "Juan Dela Cruz", age: 45, gender: "Male", contact_info: "09171234567" },
  { id: "PAT-002", name: "Maria Clara", age: 28, gender: "Female", contact_info: "09187654321" },
  { id: "PAT-003", name: "Jose Rizal", age: 35, gender: "Male", contact_info: "09191112222" }
];

const insertPatient = db.prepare("INSERT OR IGNORE INTO patients (id, name, age, gender, contact_info) VALUES (?, ?, ?, ?, ?)");
patients.forEach(p => insertPatient.run(p.id, p.name, p.age, p.gender, p.contact_info));

// Seed Vitals
const vitals = [
  { id: "VIT-001", patient_id: "PAT-001", weight: 75.5, height: 170, blood_pressure: "120/80", heart_rate: 72, temperature: 36.5 },
  { id: "VIT-002", patient_id: "PAT-002", weight: 55.0, height: 160, blood_pressure: "110/70", heart_rate: 68, temperature: 36.6 }
];

const insertVitals = db.prepare("INSERT OR IGNORE INTO vitals (id, patient_id, weight, height, blood_pressure, heart_rate, temperature) VALUES (?, ?, ?, ?, ?, ?, ?)");
vitals.forEach(v => insertVitals.run(v.id, v.patient_id, v.weight, v.height, v.blood_pressure, v.heart_rate, v.temperature));

// Seed Records
const records = [
  { id: "REC-001", patient_id: "PAT-001", diagnosis: "Common Cold", prescription: "Paracetamol 500mg, Rest", visit_date: "2026-03-01" },
  { id: "REC-002", patient_id: "PAT-002", diagnosis: "Routine Checkup", prescription: "Multivitamins", visit_date: "2026-03-05" }
];

const insertRecord = db.prepare("INSERT OR IGNORE INTO medical_records (id, patient_id, diagnosis, prescription, visit_date) VALUES (?, ?, ?, ?, ?)");
records.forEach(r => insertRecord.run(r.id, r.patient_id, r.diagnosis, r.prescription, r.visit_date));

// Seed Appointments
const appointments = [
  { id: "APP-001", patient_id: "PAT-003", appointment_date: "2026-03-15T10:00", reason: "Follow-up consultation" }
];

const insertAppointment = db.prepare("INSERT OR IGNORE INTO appointments (id, patient_id, appointment_date, reason) VALUES (?, ?, ?, ?)");
appointments.forEach(a => insertAppointment.run(a.id, a.patient_id, a.appointment_date, a.reason));

console.log("Database seeded successfully!");
