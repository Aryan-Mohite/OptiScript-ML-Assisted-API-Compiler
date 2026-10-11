/**
 * loadEnv.js
 * Tiny .env loader (no extra package). Reads KEY=value lines from .env in
 * the project root into process.env. Real environment variables win, so
 * `DB_PASSWORD=x npm start` still overrides the file. Safe to call many
 * times — it only does the work once.
 */

'use strict';

const fs = require('fs');
const path = require('path');

let loaded = false;

function loadEnv() {
  if (loaded) return;
  loaded = true;
  const file = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

module.exports = loadEnv;
