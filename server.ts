import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import session from "express-session";
import bcrypt from "bcryptjs";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOG_FILE = path.join(__dirname, "server.log");
const logger = (msg: string) => {
  const line = `${new Date().toISOString()} - ${msg}\n`;
  console.log(msg);
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch (err) {
    // Ignore log errors
  }
};

const app = express();
const PORT = 3000;

app.use(express.json());

app.set("trust proxy", 1);

app.use(session({
  name: "clinicsid",
  secret: "charlestrack-secret-key",
  resave: true,
  saveUninitialized: true,
  proxy: true,
  cookie: { 
    secure: true,
    sameSite: "none",
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Request Logger
app.use((req, res, next) => {
  logger(`${req.method} ${req.url}`);
  next();
});

// Database Setup
let db: Database.Database;
try {
  db = new Database("clinic.db");
  console.log("Database connected successfully");
} catch (err) {
  console.error("Failed to connect to database, using in-memory", err);
  db = new Database(":memory:");
}

// Initialize tables
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
    role TEXT DEFAULT 'staff',
    full_name TEXT,
    bio TEXT,
    profile_picture TEXT
  );
`);

// Create default admin if not exists
const admin = db.prepare("SELECT * FROM users WHERE username = ?").get("admin");
const hashedPassword = bcrypt.hashSync("admin123", 10);
if (!admin) {
  db.prepare("INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)")
    .run("user-" + Date.now(), "admin", hashedPassword, "admin");
  console.log("Default admin user created: admin / admin123");
} else {
  // Update password and role to ensure it's correct
  db.prepare("UPDATE users SET password = ?, role = ? WHERE username = ?").run(hashedPassword, "admin", "admin");
  console.log("Admin account synchronized");
}

// Auth Routes
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  console.log(`Login attempt for user: ${username}`);
  try {
    const user: any = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
    if (!user) {
      console.log(`User not found: ${username}`);
      return res.status(401).json({ error: "Invalid username or password" });
    }
    if (!bcrypt.compareSync(password, user.password)) {
      console.log(`Invalid password for user: ${username}`);
      return res.status(401).json({ error: "Invalid username or password" });
    }
    (req.session as any).userId = user.id;
    (req.session as any).username = user.username;
    (req.session as any).role = user.role;
    (req.session as any).full_name = user.full_name;
    (req.session as any).bio = user.bio;
    (req.session as any).profile_picture = user.profile_picture;
    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
        return res.status(500).json({ error: "Could not save session" });
      }
      console.log(`Login successful for user: ${username}, session ID: ${req.sessionID}`);
      res.json({ success: true, user: { 
        id: user.id, 
        username: user.username, 
        role: user.role,
        full_name: user.full_name,
        bio: user.bio,
        profile_picture: user.profile_picture
      } });
    });
  } catch (error: any) {
    console.error(`Login error for user ${username}:`, error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: "Could not log out" });
    res.json({ success: true });
  });
});

app.get("/api/me", (req, res) => {
  if ((req.session as any).userId) {
    res.json({ 
      authenticated: true, 
      user: { 
        id: (req.session as any).userId, 
        username: (req.session as any).username,
        role: (req.session as any).role,
        full_name: (req.session as any).full_name,
        bio: (req.session as any).bio,
        profile_picture: (req.session as any).profile_picture
      } 
    });
  } else {
    res.json({ authenticated: false });
  }
});

// API Routes
app.get("/api/patients", (req, res) => {
  try {
    const { query } = req.query;
    let patients;
    if (query) {
      patients = db.prepare("SELECT * FROM patients WHERE name LIKE ? OR id LIKE ?").all(`%${query}%`, `%${query}%`);
    } else {
      patients = db.prepare("SELECT * FROM patients ORDER BY created_at DESC").all();
    }
    res.json(patients);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/patients", (req, res) => {
  const { id, name, age, gender, contact_info } = req.body;
  try {
    db.prepare("INSERT INTO patients (id, name, age, gender, contact_info) VALUES (?, ?, ?, ?, ?)")
      .run(id, name, age, gender, contact_info);
    res.status(201).json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/patients/:id/history", (req, res) => {
  try {
    const records = db.prepare("SELECT * FROM medical_records WHERE patient_id = ? ORDER BY visit_date DESC").all(req.params.id);
    res.json(records);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Dashboard Stats
app.get("/api/dashboard/stats", (req, res) => {
  try {
    const totalPatients = db.prepare("SELECT COUNT(*) as count FROM patients").get().count;
    const totalRecords = db.prepare("SELECT COUNT(*) as count FROM medical_records").get().count;
    const upcomingAppointments = db.prepare("SELECT COUNT(*) as count FROM appointments WHERE appointment_date >= date('now')").get().count;
    
    const recentVisits = db.prepare(`
      SELECT date(visit_date) as date, COUNT(*) as count 
      FROM medical_records 
      WHERE visit_date >= date('now', '-7 days')
      GROUP BY date(visit_date)
      ORDER BY date ASC
    `).all();

    res.json({
      totalPatients,
      totalRecords,
      upcomingAppointments,
      recentVisits
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Appointments
app.get("/api/appointments", (req, res) => {
  try {
    const appointments = db.prepare(`
      SELECT a.*, p.name as patient_name 
      FROM appointments a 
      JOIN patients p ON a.patient_id = p.id 
      ORDER BY a.appointment_date ASC
    `).all();
    res.json(appointments);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/appointments", (req, res) => {
  const { id, patient_id, appointment_date, reason } = req.body;
  try {
    db.prepare("INSERT INTO appointments (id, patient_id, appointment_date, reason) VALUES (?, ?, ?, ?)")
      .run(id, patient_id, appointment_date, reason);
    res.status(201).json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Vitals
app.get("/api/patients/:id/vitals", (req, res) => {
  try {
    const vitals = db.prepare("SELECT * FROM vitals WHERE patient_id = ? ORDER BY recorded_at DESC").all(req.params.id);
    res.json(vitals);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/vitals", (req, res) => {
  const { id, patient_id, weight, height, blood_pressure, heart_rate, temperature } = req.body;
  try {
    db.prepare("INSERT INTO vitals (id, patient_id, weight, height, blood_pressure, heart_rate, temperature) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, patient_id, weight, height, blood_pressure, heart_rate, temperature);
    res.status(201).json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/records", (req, res) => {
  const { id, patient_id, diagnosis, prescription, visit_date } = req.body;
  try {
    const patient = db.prepare("SELECT id FROM patients WHERE id = ?").get(patient_id);
    if (!patient) {
      return res.status(404).json({ error: "Patient not found" });
    }

    db.prepare("INSERT INTO medical_records (id, patient_id, diagnosis, prescription, visit_date) VALUES (?, ?, ?, ?, ?)")
      .run(id, patient_id, diagnosis, prescription, visit_date);
    res.status(201).json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/contact", (req, res) => {
  const { first_name, last_name, email, message } = req.body;
  console.log(`[CONTACT] Message received from: ${email} (${first_name} ${last_name})`);
  try {
    const result = db.prepare("INSERT INTO contact_messages (first_name, last_name, email, message) VALUES (?, ?, ?, ?)")
      .run(first_name, last_name, email, message);
    console.log(`[CONTACT] Message saved with ID: ${result.lastInsertRowid}`);
    res.status(201).json({ success: true });
  } catch (error: any) {
    console.error("[CONTACT] Error saving message:", error);
    res.status(500).json({ error: "Failed to send message" });
  }
});

app.get("/api/contact", (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) {
    console.log("[CONTACT] Unauthorized fetch attempt");
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const messages = db.prepare("SELECT * FROM contact_messages ORDER BY created_at DESC").all();
    console.log(`[CONTACT] Fetched ${messages.length} messages for user ${userId}`);
    
    // Mark all as read when fetched by admin
    db.prepare("UPDATE contact_messages SET is_read = 1 WHERE is_read = 0").run();

    const messagesWithReplies = messages.map((msg: any) => {
      const replies = db.prepare("SELECT * FROM message_replies WHERE message_id = ? ORDER BY created_at ASC").all(msg.id);
      return { ...msg, replies };
    });
    res.json(messagesWithReplies);
  } catch (error: any) {
    console.error("[CONTACT] Error fetching messages:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/contact/:id/reply", (req, res) => {
  if (!(req.session as any).userId) return res.status(401).json({ error: "Unauthorized" });
  const { id } = req.params;
  const { content } = req.body;
  try {
    db.prepare("INSERT INTO message_replies (message_id, sender, content) VALUES (?, ?, ?)")
      .run(id, "admin", content);
    res.status(201).json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// User Management
app.get("/api/users", (req, res) => {
  try {
    const users = db.prepare("SELECT id, username, role FROM users").all();
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/users", (req, res) => {
  const { username, password, role } = req.body;
  logger(`[USER_MGMT] Public creation request for: ${username}`);
  
  if (!username || !password) {
    return res.status(200).json({ error: "Username and password are required" });
  }

  try {
    const targetRole = role || 'staff';
    logger(`[USER_MGMT] Creating user: ${username} as ${targetRole}`);
    
    // Check if user already exists
    const existing = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
    if (existing) {
      logger(`[USER_MGMT] Failed: ${username} already exists`);
      return res.status(200).json({ error: "Username already taken" });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const userId = "user-" + Date.now();
    db.prepare("INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)")
      .run(userId, username, hashedPassword, targetRole);
    
    logger(`[USER_MGMT] SUCCESS: User ${username} created with ID ${userId}`);
    res.status(201).json({ success: true });
  } catch (error: any) {
    logger(`[USER_MGMT] CRITICAL ERROR: ${error.message}`);
    res.status(200).json({ error: `Internal error: ${error.message}` });
  }
});

app.patch("/api/users/:id/role", (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  
  if (!role || (role !== 'admin' && role !== 'staff')) {
    return res.status(400).json({ error: "Invalid role specified" });
  }

  try {
    const result = db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, id);
    if (result.changes === 0) return res.status(404).json({ error: "User not found" });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.patch("/api/me/profile", (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { full_name, bio, profile_picture } = req.body;

  try {
    db.prepare("UPDATE users SET full_name = ?, bio = ?, profile_picture = ? WHERE id = ?")
      .run(full_name, bio, profile_picture, userId);
    
    // Update session
    (req.session as any).full_name = full_name;
    (req.session as any).bio = bio;
    (req.session as any).profile_picture = profile_picture;

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Admin command to read logs
app.get("/api/admin/logs", (req, res) => {
  if ((req.session as any).role !== "admin") return res.status(403).json({ error: "Forbidden" });
  try {
    if (!fs.existsSync(LOG_FILE)) return res.json({ logs: "No logs found." });
    const logs = fs.readFileSync(LOG_FILE, "utf-8");
    res.json({ logs });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/users/:id", (req, res) => {
  const { id } = req.params;
  
  try {
    const result = db.prepare("DELETE FROM users WHERE id = ?").run(id);
    if (result.changes === 0) return res.status(404).json({ error: "User not found" });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting Vite in development mode...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    
    app.get("*", async (req, res, next) => {
      if (req.url.startsWith("/api")) return next();
      try {
        const fs = await import("fs");
        let template = fs.readFileSync(path.resolve(__dirname, "index.html"), "utf-8");
        template = await vite.transformIndexHtml(req.url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    logger(`Server running on http://localhost:${PORT}`);
  });
}

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Unhandled Error:", err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Something went wrong on the server", details: err.message });
});

startServer().catch(err => {
  console.error("Failed to start server:", err);
});
