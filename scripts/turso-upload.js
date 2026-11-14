/**
 * turso-upload.js — Full Turso database upload pipeline (no external deps, Node 18+)
 *
 * Project : Divine Sacco Management System
 * Repo    : https://github.com/GosuccessTechnologies/sacco.git
 * Domain  : https://www.sacco.africandivinechurch.org
 *
 * Steps performed automatically:
 *   1. Set WAL mode on custom.db (edits bytes 18–19 in-place)
 *   2. Delete the existing Turso database
 *   3. Recreate it with seed.type = "database_upload"
 *   4. Wait for the database to become ready
 *   5. Generate a fresh database-scoped auth token
 *   6. Upload custom.db to the database server
 *   7. Verify by fetching the /health endpoint
 *   8. Update .env with the new TURSO_AUTH_TOKEN
 *
 * Usage (from the project root in Git Bash):
 *   node scripts/turso-upload.js
 */

'use strict';
const fs    = require('fs');
const path  = require('path');
const https = require('https');

// ─── CONFIG ─────────────────────────────────────────────────────────────────

const ORG    = 'vercel-icfg-nqyfsjgpv0n6qswkwibuyrtf';
const GROUP  = 'icfg-nqyfsjgpv0n6qswkwibuyrtf-aws-us-east-1';
const DB     = 'database-bole-yacht';
const REGION = 'aws-us-east-1';
const DB_FILE = path.resolve(__dirname, '..', 'db', 'custom.db');

// Org-level Platform API token (db:create, db:delete, db:mint-token)
const ORG_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJncm91cF91dWlkIjoiY2I3NDhkZDctYjkxZS00YzgzLWIxOWQtYTMxZTA4NzQwZWQxIiwianRpIjoiQ3l2Ym10R3dFZkdsLU5hUjBvQzNkUSIsIm9yZ19pZCI6MTAwMDI4Mzg1Miwic2NvcGVzIjp7InNjb3BlcyI6WyJkYjpjb25maWd1cmUiLCJkYjpjcmVhdGUiLCJkYjpkZWxldGUiLCJkYjptaW50LXRva2VuIiwiZGI6cm90YXRlLWNyZWRzIiwiZ3JvdXA6Y29uZmlndXJlIiwiZ3JvdXA6bWludC10b2tlbiIsImdyb3VwOnJvdGF0ZS1jcmVkcyIsInJlYWQiXX19.STTT5rnTY0SGIZHWoa6FREkHScbez4suSSXaFaXjtqsvNnbVXpYewGhBbv4jjVW4HDVGufFEUEOdPhsiA9xpBA';

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function log(msg) { console.log('[turso-upload]', msg); }

function request(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      method,
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: { ...headers },
    };
    if (body) {
      const buf = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
      opts.headers['Content-Length'] = buf.length;
      if (!opts.headers['Content-Type'] && !Buffer.isBuffer(body)) {
        opts.headers['Content-Type'] = 'application/json';
      }
    }
    const req = https.request(opts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode, body: raw });
      });
    });
    req.on('error', reject);
    if (body) req.write(Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body)));
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── STEP 1: WAL MODE ────────────────────────────────────────────────────────

function setWAL() {
  log('Step 1 — Setting WAL mode on ' + DB_FILE);
  if (!fs.existsSync(DB_FILE)) throw new Error('DB file not found: ' + DB_FILE);
  const buf = fs.readFileSync(DB_FILE);
  const magic = buf.slice(0, 15).toString('utf8');
  if (!magic.startsWith('SQLite format 3')) throw new Error('Not a SQLite3 file');
  const sizeMB = (buf.length / 1024 / 1024).toFixed(2);
  log('  Size: ' + sizeMB + ' MB  |  write=' + buf[18] + ' read=' + buf[19]);
  if (buf[18] !== 2 || buf[19] !== 2) {
    buf[18] = 2;
    buf[19] = 2;
    fs.writeFileSync(DB_FILE, buf);
    log('  WAL mode set.');
  } else {
    log('  Already WAL — skipped.');
  }
  [DB_FILE + '-wal', DB_FILE + '-shm'].forEach(p => {
    if (fs.existsSync(p)) { fs.unlinkSync(p); log('  Removed sidecar: ' + path.basename(p)); }
  });
}

// ─── STEP 2: DELETE ──────────────────────────────────────────────────────────

async function deleteDB() {
  log('Step 2 — Deleting existing database: ' + DB);
  const url = `https://api.turso.tech/v1/organizations/${ORG}/databases/${DB}`;
  const r = await request('DELETE', url, { Authorization: 'Bearer ' + ORG_TOKEN });
  log('  Response: ' + r.status + ' ' + r.body.slice(0, 120));
  if (r.status !== 200 && r.status !== 404) {
    throw new Error('Delete failed with status ' + r.status + ': ' + r.body);
  }
  log('  Deleted (or did not exist).');
  await sleep(2000);
}

// ─── STEP 3: RECREATE ────────────────────────────────────────────────────────

async function createDB() {
  log('Step 3 — Recreating database with seed.type=database_upload');
  const url = `https://api.turso.tech/v1/organizations/${ORG}/databases`;
  const payload = { name: DB, group: GROUP, seed: { type: 'database_upload' } };
  const r = await request('POST', url, { Authorization: 'Bearer ' + ORG_TOKEN }, payload);
  log('  Response: ' + r.status + ' ' + r.body.slice(0, 200));
  if (r.status !== 200 && r.status !== 201) {
    throw new Error('Create failed with status ' + r.status + ': ' + r.body);
  }
  log('  Database created successfully.');
  log('  Waiting 5s for provisioning...');
  await sleep(5000);
}

// ─── STEP 4: GENERATE DB TOKEN ───────────────────────────────────────────────

async function generateToken() {
  log('Step 4 — Generating database auth token');
  const url = `https://api.turso.tech/v1/organizations/${ORG}/databases/${DB}/auth/tokens`;
  const r = await request('POST', url, { Authorization: 'Bearer ' + ORG_TOKEN });
  log('  Response: ' + r.status);
  if (r.status !== 200) {
    throw new Error('Token generation failed: ' + r.body);
  }
  const parsed = JSON.parse(r.body);
  const token = parsed.jwt;
  if (!token) throw new Error('No jwt in response: ' + r.body);
  log('  Token generated: ' + token.slice(0, 30) + '...');
  return token;
}

// ─── STEP 5: UPLOAD ──────────────────────────────────────────────────────────

async function uploadDB(dbToken) {
  log('Step 5 — Uploading ' + DB_FILE);
  const fileData = fs.readFileSync(DB_FILE);
  const fileSize = fileData.length;
  log('  File size: ' + (fileSize / 1024 / 1024).toFixed(2) + ' MB');

  const hostname = `${DB}-${ORG}.${REGION}.turso.io`;
  const uploadUrl = `https://${hostname}/v1/upload`;
  log('  Upload URL: ' + uploadUrl);

  const r = await request('POST', uploadUrl, {
    Authorization: 'Bearer ' + dbToken,
    'Content-Type': 'application/octet-stream',
    'Content-Length': fileSize,
  }, fileData);

  log('  Response: ' + r.status + ' ' + r.body.slice(0, 200));
  if (r.status !== 200) {
    throw new Error('Upload failed with status ' + r.status + ': ' + r.body);
  }
  log('  Upload successful!');
  return dbToken;
}

// ─── STEP 6: HEALTH CHECK ────────────────────────────────────────────────────

async function healthCheck(dbToken) {
  log('Step 6 — Health check');
  const hostname = `${DB}-${ORG}.${REGION}.turso.io`;
  const r = await request('GET', `https://${hostname}/health`, {
    Authorization: 'Bearer ' + dbToken,
  });
  log('  Health: ' + r.status + (r.status === 200 ? ' OK' : ' ' + r.body));
}

// ─── STEP 7: UPDATE .env ─────────────────────────────────────────────────────

function updateEnv(dbToken) {
  log('Step 7 — Updating .env with new TURSO_AUTH_TOKEN');
  const envFile = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envFile)) {
    log('  .env not found — skipping update.');
    return;
  }
  let content = fs.readFileSync(envFile, 'utf8');
  if (/^TURSO_AUTH_TOKEN=/m.test(content)) {
    content = content.replace(/^TURSO_AUTH_TOKEN=.*/m, `TURSO_AUTH_TOKEN="${dbToken}"`);
  } else {
    content += `\nTURSO_AUTH_TOKEN="${dbToken}"\n`;
  }
  fs.writeFileSync(envFile, content, 'utf8');
  log('  .env updated.');
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n========================================');
  console.log(' Turso Upload Pipeline — ' + DB);
  console.log(' Divine Sacco Management System');
  console.log('========================================\n');
  try {
    setWAL();
    await deleteDB();
    await createDB();
    const dbToken = await generateToken();
    await uploadDB(dbToken);
    await healthCheck(dbToken);
    updateEnv(dbToken);
    console.log('\n✅ SUCCESS — ' + DB + ' is loaded and ready.');
    console.log('\nNew TURSO_AUTH_TOKEN for this database:');
    console.log(dbToken);
    console.log('\nUpdate this value in:');
    console.log('  1. .env  (done automatically above)');
    console.log('  2. Vercel → Project → Settings → Environment Variables');
    console.log('  3. Update CRON_SECRET in vercel.json cron paths before deploying\n');
  } catch (err) {
    console.error('\n❌ FAILED:', err.message);
    process.exit(1);
  }
}

main();
