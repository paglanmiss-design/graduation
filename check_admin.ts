import Database from "better-sqlite3";
const db = new Database("clinic.db");
const user = db.prepare("SELECT * FROM users WHERE username = 'admin'").get();
console.log(JSON.stringify(user, null, 2));
db.close();
