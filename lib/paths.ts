import fs from "node:fs";
import path from "node:path";

export function dataDir() {
  return path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data"));
}

export function mediaDir() {
  return path.join(dataDir(), "media");
}

export function dbPath() {
  return path.join(dataDir(), "factory.db");
}

export function ensureDirs() {
  fs.mkdirSync(mediaDir(), { recursive: true });
}
