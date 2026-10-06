import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.ts";

export const db = new DatabaseSync(path.join(config.dataDir, "resume-builder.db"));

db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

// Append-only list; each entry runs once, in order.
const migrations: string[] = [
  `CREATE TABLE profiles (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     language TEXT NOT NULL,
     data TEXT NOT NULL,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   );
   CREATE TABLE imports (
     id TEXT PRIMARY KEY,
     file_name TEXT NOT NULL,
     text TEXT NOT NULL,
     status TEXT NOT NULL,
     error TEXT,
     detected_language TEXT NOT NULL,
     draft TEXT NOT NULL,
     created_at TEXT NOT NULL
   );
   CREATE TABLE settings (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   );`,
  `CREATE TABLE jobs (
     id TEXT PRIMARY KEY,
     description TEXT NOT NULL,
     instructions TEXT NOT NULL DEFAULT '',
     profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
     profile_name TEXT NOT NULL,
     language TEXT NOT NULL,
     status TEXT NOT NULL,
     step TEXT NOT NULL DEFAULT '',
     error TEXT,
     analysis TEXT,
     base TEXT,
     assessment TEXT,
     suggestions TEXT NOT NULL DEFAULT '[]',
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   );`,
];

const { user_version: current } = db.prepare("PRAGMA user_version").get() as { user_version: number };
for (let v = current; v < migrations.length; v++) {
  db.exec("BEGIN");
  try {
    db.exec(migrations[v]!);
    db.exec(`PRAGMA user_version = ${v + 1}`);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function getSetting(key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string | null): void {
  if (value === null) db.prepare("DELETE FROM settings WHERE key = ?").run(key);
  else db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}
