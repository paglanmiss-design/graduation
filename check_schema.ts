import Database from "better-sqlite3";
const db = new Database("clinic.db");
const columns = db.prepare("PRAGMA table_info(users)").all();
console.log(JSON.stringify(columns, null, 2));
db.close();
