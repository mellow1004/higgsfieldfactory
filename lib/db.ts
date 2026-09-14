import fs from "node:fs";
import Database from "better-sqlite3";
import { dbPath, ensureDirs } from "./paths";

type GlobalDb = typeof globalThis & { __factoryDb?: Database.Database };

const globalDb = globalThis as GlobalDb;

export function getDb() {
  if (globalDb.__factoryDb) return globalDb.__factoryDb;

  ensureDirs();
  const database = new Database(dbPath());
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      created_by TEXT NOT NULL,
      brand TEXT NOT NULL,
      service TEXT NOT NULL,
      message TEXT NOT NULL,
      tone TEXT NOT NULL,
      model TEXT NOT NULL,
      style_preset TEXT NOT NULL,
      aspect_ratio TEXT NOT NULL,
      duration INTEGER NOT NULL,
      resolution TEXT NOT NULL,
      credit_cost INTEGER NOT NULL,
      status TEXT NOT NULL,
      stage TEXT NOT NULL DEFAULT '',
      video_prompt TEXT,
      eyebrow TEXT,
      headline TEXT,
      tagline TEXT,
      cta TEXT,
      higgsfield_request_id TEXT,
      raw_video_path TEXT,
      final_video_path TEXT,
      mocked INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS jobs_updated_at ON jobs (updated_at DESC);
  `);

  globalDb.__factoryDb = database;
  return database;
}

export function fileExists(filePath: string) {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}
