import Database from "better-sqlite3";
const db = new Database("clinic.db");
try {
  const messages = db.prepare("SELECT * FROM contact_messages").all();
  console.log("ALL MESSAGES IN DB:", JSON.stringify(messages, null, 2));
  const users = db.prepare("SELECT id, username, role FROM users").all();
  console.log("USERS IN DB:", JSON.stringify(users, null, 2));
} catch (err) {
  console.error(err);
} finally {
  db.close();
}
