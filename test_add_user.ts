import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
const db = new Database("clinic.db");
try {
  const hashedPassword = bcrypt.hashSync("testpass123", 10);
  const result = db.prepare("INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)")
    .run("test-user-" + Date.now(), "testuser", hashedPassword, "staff");
  console.log("Success:", result);
} catch (e: any) {
  console.error("Error:", e.message);
}
db.close();
