import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
const db = new Database("clinic.db");

console.log("Fixing users table...");

db.exec(`
  DROP TABLE IF EXISTS users;
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff'
  );
`);

const hashedPassword = bcrypt.hashSync("admin123", 10);
db.prepare("INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)")
  .run("user-admin", "admin", hashedPassword, "admin");

console.log("Users table fixed. Default admin: admin / admin123");
db.close();
