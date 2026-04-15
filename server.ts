import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import cookieSession from "cookie-session";
import bcrypt from "bcryptjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

app.set("trust proxy", true);

// Database Setup
let db: Database.Database;
try {
  const dbPath = path.join(process.cwd(), "clinic.db");
  db = new Database(dbPath);
  console.log(`Database connected successfully at ${dbPath}`);
} catch (err) {
  console.error("Failed to connect to database, using in-memory", err);
  db = new Database(":memory:");
}

app.use(cookieSession({
  name: "charlestrack-session",
  keys: ["charlestrack-secret-key"],
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  secure: true,
  sameSite: "none",
  httpOnly: true
}));

// Token-based Auth Middleware (Fallback for blocked cookies)
app.use((req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    try {
      // For this app, we'll use the userId as a simple token
      const user: any = db.prepare("SELECT id, username, role FROM users WHERE id = ?").get(token);
      if (user) {
        (req.session as any).userId = user.id;
        (req.session as any).username = user.username;
        (req.session as any).role = user.role;
        console.log(`[Auth] Token authenticated user: ${user.username}`);
      }
    } catch (err) {
      console.error("[Auth] Token verification failed", err);
    }
  }
  next();
});

// Request Logger with Session Debug
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url} - UserID: ${(req.session as any)?.userId}`);
  next();
});

// Initialize tables with individual execution to catch specific errors
const tables = [
  `CREATE TABLE IF NOT EXISTS patients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    age INTEGER NOT NULL,
    gender TEXT NOT NULL,
    contact_info TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS medical_records (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    diagnosis TEXT NOT NULL,
    prescription TEXT NOT NULL,
    visit_date TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id)
  )`,
  `CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    appointment_date TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'Scheduled',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id)
  )`,
  `CREATE TABLE IF NOT EXISTS vitals (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    weight REAL,
    height REAL,
    blood_pressure TEXT,
    heart_rate INTEGER,
    temperature REAL,
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id)
  )`,
  `CREATE TABLE IF NOT EXISTS contact_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS message_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL,
    sender TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (message_id) REFERENCES contact_messages(id)
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'admin'
  )`
];

tables.forEach(sql => {
  try {
    db.exec(sql);
  } catch (err) {
    console.error(`Error creating table: ${err}`);
  }
});

// Create or update default admin
const hashedPassword = bcrypt.hashSync("admin123", 10);
const admin = db.prepare("SELECT * FROM users WHERE username = ?").get("admin") as any;
if (!admin) {
  db.prepare("INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)")
    .run("user-admin-" + Date.now(), "admin", hashedPassword, "admin");
  console.log("Default admin user created: admin / admin123");
} else {
  db.prepare("UPDATE users SET password = ?, role = ? WHERE username = ?").run(hashedPassword, "admin", "admin");
  console.log("Admin user password reset to admin123 for debugging.");
}

const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get() as any;
console.log(`Total users in database: ${userCount.count}`);

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
    
    console.log(`Login successful for user: ${username}, UserID in session: ${(req.session as any).userId}`);
    res.json({ 
      success: true, 
      user: { id: user.id, username: user.username, role: user.role },
      token: user.id // Return userId as token for fallback
    });
  } catch (error: any) {
    console.error(`Login error for user ${username}:`, error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/logout", (req, res) => {
  req.session = null;
  res.json({ success: true });
});

app.get("/api/me", (req, res) => {
  const session = req.session as any;
  console.log(`[GET /api/me] UserID: ${session?.userId}`);
  if (session?.userId) {
    res.json({ 
      authenticated: true, 
      user: { 
        id: session.userId, 
        username: session.username,
        role: session.role
      } 
    });
  } else {
    res.json({ authenticated: false });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Signup Route
app.post("/api/signup", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });
  
  try {
    const hashedPassword = bcrypt.hashSync(password, 10);
    db.prepare("INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)")
      .run("user-" + Date.now(), username, hashedPassword, "staff");
    res.status(201).json({ success: true });
  } catch (error: any) {
    if (error.message.includes("UNIQUE constraint failed")) {
      return res.status(400).json({ error: "Username already exists" });
    }
    res.status(500).json({ error: error.message });
  }
});

// User Management (Admin Only)
app.get("/api/users", (req, res) => {
  const session = req.session as any;
  console.log(`[GET /api/users] Session: ${JSON.stringify({ userId: session.userId, role: session.role })}`);
  
  if (session.role !== "admin") {
    console.log(`[GET /api/users] Access denied: Role is ${session.role}`);
    return res.status(403).json({ error: "Forbidden: Admin access required" });
  }
  
  try {
    const users = db.prepare("SELECT id, username, role FROM users").all();
    console.log(`[GET /api/users] Found ${users.length} users`);
    res.json(users);
  } catch (error: any) {
    console.error("[GET /api/users] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.patch("/api/users/:id/role", (req, res) => {
  if ((req.session as any).role !== "admin") return res.status(403).json({ error: "Forbidden" });
  const { id } = req.params;
  const { role } = req.body;
  try {
    db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/users/:id", (req, res) => {
  if ((req.session as any).role !== "admin") return res.status(403).json({ error: "Forbidden" });
  const { id } = req.params;
  try {
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/users", (req, res) => {
  const session = req.session as any;
  console.log(`[POST /api/users] Session: ${JSON.stringify({ userId: session.userId, role: session.role })}`);
  
  if (session.role !== "admin") return res.status(403).json({ error: "Forbidden: Admin access required" });
  const { username, password, role } = req.body;
  if (!username || !password || !role) return res.status(400).json({ error: "Missing fields" });
  try {
    const hashedPassword = bcrypt.hashSync(password, 10);
    const id = "user-" + Date.now();
    db.prepare("INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)")
      .run(id, username, hashedPassword, role);
    console.log(`[POST /api/users] Created user: ${username} with role: ${role}`);
    res.status(201).json({ success: true, user: { id, username, role } });
  } catch (error: any) {
    console.error("[POST /api/users] Error:", error);
    if (error.message.includes("UNIQUE constraint failed")) {
      return res.status(400).json({ error: "Username already exists" });
    }
    res.status(500).json({ error: error.message });
  }
});

app.patch("/api/users/:id/password", (req, res) => {
  if ((req.session as any).role !== "admin") return res.status(403).json({ error: "Forbidden" });
  const { id } = req.params;
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: "Password required" });
  try {
    const hashedPassword = bcrypt.hashSync(password, 10);
    db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashedPassword, id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// API Routes
app.get("/api/patients", (req, res) => {
  if (!(req.session as any).userId) return res.status(401).json({ error: "Unauthorized" });
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
    console.error("Error fetching patients:", error);
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
  if (!(req.session as any).userId) return res.status(401).json({ error: "Unauthorized" });
  const role = (req.session as any).role;
  if (role !== "admin" && role !== "doctor") return res.status(403).json({ error: "Forbidden: Only doctors or admins can add vitals" });
  
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
  if (!(req.session as any).userId) return res.status(401).json({ error: "Unauthorized" });
  const role = (req.session as any).role;
  if (role !== "admin" && role !== "doctor") return res.status(403).json({ error: "Forbidden: Only doctors or admins can add records" });

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

app.get("/api/health", (req, res) => {
  try {
    const msgCount = db.prepare("SELECT COUNT(*) as count FROM contact_messages").get().count;
    res.json({ status: "ok", database: "connected", messages: msgCount });
  } catch (err: any) {
    res.status(500).json({ status: "error", error: err.message });
  }
});

app.post("/api/contact", (req, res) => {
  const { first_name, last_name, email, message } = req.body;
  console.log(`[CONTACT] Incoming message attempt from: ${email}`);
  
  if (!first_name || !last_name || !email || !message) {
    console.error("[CONTACT] Validation failed: Missing fields", req.body);
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    const result = db.prepare("INSERT INTO contact_messages (first_name, last_name, email, message) VALUES (?, ?, ?, ?)")
      .run(first_name, last_name, email, message);
    console.log(`[CONTACT] Message successfully saved. ID: ${result.lastInsertRowid}`);
    res.status(201).json({ success: true });
  } catch (error: any) {
    console.error("[CONTACT] Database error while saving message:", error);
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
    db.prepare("UPDATE contact_messages SET is_read = 1 WHERE id = ?").run(id);
    res.status(201).json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/contact/:id/read", (req, res) => {
  if (!(req.session as any).userId) return res.status(401).json({ error: "Unauthorized" });
  const { id } = req.params;
  try {
    db.prepare("UPDATE contact_messages SET is_read = 1 WHERE id = ?").run(id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 404 for API routes
app.all("/api/*", (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
});

// Global Error Handler for API
app.use("/api", (err: any, req: any, res: any, next: any) => {
  console.error("API Error:", err);
  res.status(err.status || 500).json({ 
    error: err.message || "Internal Server Error",
    details: process.env.NODE_ENV === "development" ? err.stack : undefined
  });
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
      // Skip API routes - they should have been handled or hit the API 404
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
    app.get("*", (req, res, next) => {
      if (req.url.startsWith("/api")) return next();
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
});
