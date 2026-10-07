// VisitVault server — Single-file backend covering all SRS requirements
try { require('dotenv').config(); } catch (e) {}

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const nodemailer = require('nodemailer');
const { Pool } = require('pg');

const app = express();
const PORT = Number(process.env.PORT || 3000);

const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-me';
const ENC_KEY = crypto.createHash('sha256').update(process.env.ENC_KEY || 'dev-enc-key-change-me').digest();
const OTP_TTL_SEC = 120;
const RETENTION_DAYS = 180;
const MAX_CHAIN_CHECK = 10000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/visitvault'
});

// ---------- helpers ----------
function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

function istString(d) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).format(d);
}

function encField(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

function decField(b64) {
  try {
    const buf = Buffer.from(b64, 'base64');
    const iv = buf.slice(0, 12);
    const tag = buf.slice(12, 28);
    const ct = buf.slice(28);
    const d = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
  } catch (e) { return '(decrypt error)'; }
}

function hashPassword(pw, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(pw, s, 64).toString('hex');
  return `${s}:${h}`;
}
function verifyPassword(pw, stored) {
  try {
    const [s, h] = stored.split(':');
    const h2 = crypto.scryptSync(pw, s, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(h2, 'hex'));
  } catch (e) { return false; }
}
function genOtp() { return String(crypto.randomInt(0, 1000000)).padStart(6, '0'); }
function hashOtp(otp, tokenId) { return sha256(otp + ':' + tokenId + ':' + JWT_SECRET); }

// ---------- sessions ----------
const sessions = new Map();
function newSession(user) {
  const t = crypto.randomBytes(24).toString('hex');
  sessions.set(t, {
    userId: user.id, role: user.role, username: user.username,
    expires: Date.now() + 8 * 3600 * 1000
  });
  return t;
}
function getSession(req) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!t) return null;
  const s = sessions.get(t);
  if (!s || s.expires < Date.now()) { sessions.delete(t); return null; }
  return s;
}
function auth(roles) {
  return (req, res, next) => {
    const s = getSession(req);
    if (!s) return res.status(401).json({ error: 'Not logged in' });
    if (roles && !roles.includes(s.role)) return res.status(403).json({ error: 'Forbidden for role ' + s.role });
    req.user = s;
    next();
  };
}

// ---------- rate limiter ----------
const rl = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const arr = (rl.get(key) || []).filter(t => now - t < windowMs);
  arr.push(now);
  rl.set(key, arr);
  return arr.length <= max;
}

// ---------- input validation ----------
function validateVisitorInput(b) {
  const errs = [];
  if (!b || typeof b !== 'object') return ['body must be an object'];
  if (!b.name || typeof b.name !== 'string' || b.name.length < 2 || b.name.length > 80) errs.push('name must be 2-80 chars');
  if (!/^[0-9+\-\s]{7,15}$/.test(b.phone || '')) errs.push('phone must be 7-15 digits');
  if (b.purpose && (typeof b.purpose !== 'string' || b.purpose.length > 200)) errs.push('purpose too long');
  if (!b.valid_from || isNaN(Date.parse(b.valid_from))) errs.push('valid_from invalid');
  if (!b.valid_to || isNaN(Date.parse(b.valid_to))) errs.push('valid_to invalid');
  if (Date.parse(b.valid_to) <= Date.parse(b.valid_from)) errs.push('valid_to must be after valid_from');
  if (!b.consent) errs.push('consent required (DPDP Act)');
  return errs;
}

// ---------- ledger (Person 4) ----------
async function appendEntry(client, entry) {
  if (!client) {
    const t = await pool.connect();
    try {
      await t.query('BEGIN');
      const r = await appendEntry(t, entry);
      await t.query('COMMIT');
      return r;
    } catch (e) { await t.query('ROLLBACK'); throw e; }
    finally { t.release(); }
  }
  const c = client;
  await c.query('SELECT pg_advisory_xact_lock(424242)');
  const last = await c.query('SELECT hash FROM ledger ORDER BY id DESC LIMIT 1');
  const prev = last.rows[0] ? last.rows[0].hash : 'GENESIS';
  const ts = new Date().toISOString();
  const payload = `${prev}|${ts}|${entry.actorId || ''}|${entry.actorRole || ''}|${entry.action}|${entry.details || ''}|${entry.tokenId || ''}`;
  const hash = sha256(payload);
  const r = await c.query(
    `INSERT INTO ledger (ts, actor_id, actor_role, action, details, token_id, prev_hash, hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [ts, entry.actorId || null, entry.actorRole || null, entry.action, entry.details || null, entry.tokenId || null, prev, hash]
  );
  return { id: r.rows[0].id, hash };
}

async function verifyChain(limit) {
  const max = Math.min(limit || MAX_CHAIN_CHECK, MAX_CHAIN_CHECK);
  const r = await pool.query(
    `SELECT * FROM (
       SELECT id, ts, actor_id, actor_role, action, details, token_id, prev_hash, hash
       FROM ledger ORDER BY id DESC LIMIT $1
     ) sub ORDER BY id ASC`,
    [max]
  );
  let prev = 'GENESIS';
  for (const row of r.rows) {
    const ts = new Date(row.ts).toISOString();
    const payload = `${prev}|${ts}|${row.actor_id || ''}|${row.actor_role || ''}|${row.action}|${row.details || ''}|${row.token_id || ''}`;
    const h = sha256(payload);
    if (h !== row.hash || row.prev_hash !== prev) {
      return { ok: false, brokenId: row.id, scanned: r.rows.length };
    }
    prev = row.hash;
  }
  return { ok: true, scanned: r.rows.length, head: prev };
}

// ---------- alerts ----------
async function sendAlert({ severity = 'high', message, tokenId, actorId }) {
  await pool.query(
    'INSERT INTO alerts (severity, message, token_id, actor_id) VALUES ($1,$2,$3,$4)',
    [severity, message, tokenId || null, actorId || null]
  );
  console.log(`[ALERT ${severity}] ${message}`);
}

// ---------- email ----------
let mailer = null;
function getMailer() {
  if (mailer) return mailer;
  if (!process.env.SMTP_HOST) return null;
  mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
  });
  return mailer;
}
async function sendEmail(to, subject, text) {
  const m = getMailer();
  if (!m) { console.log(`[EMAIL-DEV] to=${to} subject=${subject}\n${text}`); return; }
  try { await m.sendMail({ from: process.env.SMTP_FROM || 'no-reply@visitvault.local', to, subject, text }); }
  catch (e) { console.error('email failed:', e.message); }
}

// ---------- retention purge (Person 1) ----------
async function purgeOld() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000);
  const r1 = await pool.query('DELETE FROM visitors WHERE created_at < $1', [cutoff]);
  const r2 = await pool.query('DELETE FROM alerts  WHERE ts < $1', [cutoff]);
  if (r1.rowCount || r2.rowCount)
    console.log(`[purge] visitors=${r1.rowCount} alerts=${r2.rowCount}`);
}
setInterval(() => purgeOld().catch(e => console.error('purge err', e.message)), 24 * 3600 * 1000);

// ---------- schema + seed ----------
async function ensureDatabase() {
  const url = new URL(process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/visitvault');
  const dbName = url.pathname.slice(1);
  const adminUrl = new URL(url.toString());
  adminUrl.pathname = '/postgres';
  const admin = new Pool({ connectionString: adminUrl.toString() });
  try {
    const r = await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [dbName]);
    if (r.rowCount === 0) {
      await admin.query(`CREATE DATABASE "${dbName}"`);
      console.log('Created database:', dbName);
    }
  } catch (e) {
    console.error('Could not verify database:', e.message);
    console.error('Please ensure PostgreSQL is running and DATABASE_URL is correct.');
    process.exit(1);
  } finally { await admin.end(); }
}

async function ensureSchema() {
  const sql = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
  await pool.query(sql);
}

async function seed() {
  const r = await pool.query('SELECT count(*)::int AS c FROM users');
  if (r.rows[0].c > 0) return;
  const users = [
    ['admin', 'admin123', 'admin', 'Admin User', 'admin@vv.local'],
    ['guard', 'guard123', 'guard', 'Gate Guard', 'guard@vv.local'],
    ['resident', 'resident123', 'resident', 'Resident One', 'res1@vv.local'],
    ['resident2', 'resident123', 'resident', 'Resident Two', 'res2@vv.local']
  ];
  for (const [u, p, role, full, email] of users) {
    await pool.query(
      'INSERT INTO users (username,password_hash,role,full_name,email) VALUES ($1,$2,$3,$4,$5)',
      [u, hashPassword(p), role, full, email]
    );
  }
  await appendEntry(null, { actorRole: 'system', action: 'SEED', details: 'Initial system seed' });
  console.log('Seeded default users (see README for credentials).');
}

// ==================== ROUTES ====================
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// <<< ADDED: jsQR vendor route — serves node_modules/jsqr/dist/jsQR.js at /vendor/jsQR.js
app.use('/vendor', express.static(path.join(__dirname, 'node_modules', 'jsqr', 'dist')));

app.get('/api/health', (req, res) => res.json({ ok: true, ist: istString(new Date()) }));

// ---------- LOGIN ----------
app.post('/api/login', async (req, res) => {
  const ip = req.ip;
  if (!rateLimit('login:' + ip, 20, 60 * 1000)) return res.status(429).json({ error: 'Too many attempts' });
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username & password required' });
  const r = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
  const u = r.rows[0];
  if (!u || !verifyPassword(password, u.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
  const token = newSession(u);
  await appendEntry(null, { actorId: u.id, actorRole: u.role, action: 'LOGIN', details: `user=${u.username}` });
  res.json({ token, user: { id: u.id, username: u.username, role: u.role, full_name: u.full_name } });
});

app.post('/api/logout', auth(), async (req, res) => {
  const t = (req.headers.authorization || '').slice(7);
  sessions.delete(t);
  await appendEntry(null, { actorId: req.user.userId, actorRole: req.user.role, action: 'LOGOUT', details: `user=${req.user.username}` });
  res.json({ ok: true });
});

// ---------- RESIDENT: create pass ----------
app.post('/api/visitors', auth(['resident']), async (req, res) => {
  const errs = validateVisitorInput(req.body);
  if (errs.length) return res.status(400).json({ error: errs.join('; ') });

  const { name, phone, purpose, valid_from, valid_to } = req.body;
  const tokenId = crypto.randomBytes(12).toString('hex');
  const otp = genOtp();
  const otpExpires = new Date(Date.now() + OTP_TTL_SEC * 1000);

  const jwtPayload = {
    sub: tokenId,
    residentId: req.user.userId,
    iat: Math.floor(Date.now() / 1000),
    nbf: Math.floor(Date.parse(valid_from) / 1000),
    exp: Math.floor(Date.parse(valid_to) / 1000)
  };
  const token = jwt.sign(jwtPayload, JWT_SECRET, { algorithm: 'HS256' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO visitors
        (resident_id, name_enc, phone_enc, purpose, valid_from, valid_to,
         token_id, otp_hash, otp_expires, status, consent_given)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',$10) RETURNING id`,
      [req.user.userId, encField(name), encField(phone), purpose || '',
       valid_from, valid_to, tokenId, hashOtp(otp, tokenId), otpExpires, true]
    );
    await appendEntry(client, {
      actorId: req.user.userId, actorRole: 'resident', action: 'TOKEN_ISSUED',
      details: `visitor#${ins.rows[0].id} valid=${istString(new Date(valid_from))}->${istString(new Date(valid_to))}`,
      tokenId
    });
    await client.query('COMMIT');

    const qr = await QRCode.toDataURL(token, { width: 320, margin: 1 });
    const u = await pool.query('SELECT email FROM users WHERE id=$1', [req.user.userId]);
    sendEmail(u.rows[0].email, 'VisitVault: Visitor pass issued',
      `Visitor pass issued.\nName: ${name}\nValid: ${istString(new Date(valid_from))} - ${istString(new Date(valid_to))}\nOTP (valid ${OTP_TTL_SEC}s): ${otp}`
    ).catch(() => {});

    res.json({ id: ins.rows[0].id, tokenId, qr, token, otp, otpExpires, otpTtlSec: OTP_TTL_SEC });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'Failed to create visitor pass' });
  } finally { client.release(); }
});

// ---------- RESIDENT: list own visitors ----------
app.get('/api/visitors', auth(['resident']), async (req, res) => {
  const r = await pool.query(
    `SELECT id,name_enc,phone_enc,purpose,valid_from,valid_to,token_id,status,created_at,used_at,exit_at
     FROM visitors WHERE resident_id=$1 ORDER BY id DESC`, [req.user.userId]);
  const now = Date.now();
  res.json({
    visitors: r.rows.map(v => ({
      id: v.id, name: decField(v.name_enc), phone: decField(v.phone_enc), purpose: v.purpose,
      valid_from: v.valid_from, valid_to: v.valid_to, token_id: v.token_id,
      status: (v.status === 'active' && Date.parse(v.valid_to) < now) ? 'expired' : v.status,
      used_at: v.used_at, exit_at: v.exit_at
    }))
  });
});

// ---------- RESIDENT: revoke ----------
app.post('/api/visitors/:id/revoke', auth(['resident']), async (req, res) => {
  const id = Number(req.params.id);
  const r = await pool.query('SELECT * FROM visitors WHERE id=$1 AND resident_id=$2', [id, req.user.userId]);
  const v = r.rows[0];
  if (!v) return res.status(404).json({ error: 'Not found' });
  if (v.status !== 'active') return res.status(400).json({ error: 'Only active passes can be revoked' });
  await pool.query('UPDATE visitors SET status=$1 WHERE id=$2', ['revoked', id]);
  await appendEntry(null, { actorId: req.user.userId, actorRole: 'resident', action: 'REVOKE', details: `visitor#${id}`, tokenId: v.token_id });
  res.json({ ok: true });
});

// ---------- RESIDENT: new OTP ----------
app.post('/api/visitors/:id/new-otp', auth(['resident']), async (req, res) => {
  const id = Number(req.params.id);
  const r = await pool.query('SELECT * FROM visitors WHERE id=$1 AND resident_id=$2', [id, req.user.userId]);
  const v = r.rows[0];
  if (!v) return res.status(404).json({ error: 'Not found' });
  if (v.status !== 'active') return res.status(400).json({ error: 'Pass not active' });
  const otp = genOtp();
  const otpExpires = new Date(Date.now() + OTP_TTL_SEC * 1000);
  await pool.query('UPDATE visitors SET otp_hash=$1, otp_expires=$2 WHERE id=$3', [hashOtp(otp, v.token_id), otpExpires, id]);
  await appendEntry(null, { actorId: req.user.userId, actorRole: 'resident', action: 'OTP_REISSUED', details: `visitor#${id}`, tokenId: v.token_id });
  res.json({ otp, otpExpires, otpTtlSec: OTP_TTL_SEC });
});

// ---------- GUARD: verify QR ----------
app.post('/api/verify/qr', auth(['guard']), async (req, res) => {
  const t0 = Date.now();
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'token required' });
  let payload;
  try { payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }); }
  catch (e) {
    await sendAlert({ severity: 'high', message: `Invalid signature attempt by guard=${req.user.username}`, actorId: req.user.userId });
    await appendEntry(null, { actorId: req.user.userId, actorRole: 'guard', action: 'VERIFY_FAIL', details: 'bad signature' });
    return res.json({ ok: false, reason: 'Invalid signature', elapsedMs: Date.now() - t0 });
  }
  const result = await doVerify(payload.sub, req.user, 'QR');
  result.elapsedMs = Date.now() - t0;
  res.json(result);
});

// ---------- GUARD: verify OTP ----------
app.post('/api/verify/otp', auth(['guard']), async (req, res) => {
  const t0 = Date.now();
  const { otp } = req.body || {};
  if (!/^\d{6}$/.test(otp || '')) return res.status(400).json({ error: '6-digit OTP required' });

  const key = 'otp:' + req.user.userId;
  if (!rateLimit(key, 10, 60 * 1000)) {
    await sendAlert({ severity: 'high', message: `OTP brute-force blocked guard=${req.user.username}`, actorId: req.user.userId });
    return res.status(429).json({ error: 'Too many OTP attempts' });
  }

  const cand = await pool.query(
    `SELECT * FROM visitors WHERE status='active' AND otp_expires > now()
     AND valid_from <= now() AND valid_to >= now() ORDER BY id DESC LIMIT 500`);
  let match = null;
  for (const v of cand.rows) {
    if (hashOtp(otp, v.token_id) === v.otp_hash) { match = v; break; }
  }
  if (!match) {
    await sendAlert({ severity: 'high', message: `Failed OTP by guard=${req.user.username}`, actorId: req.user.userId });
    await appendEntry(null, { actorId: req.user.userId, actorRole: 'guard', action: 'VERIFY_FAIL', details: 'bad OTP' });
    return res.json({ ok: false, reason: 'Invalid OTP', elapsedMs: Date.now() - t0 });
  }
  const result = await doVerify(match.token_id, req.user, 'OTP');
  result.elapsedMs = Date.now() - t0;
  res.json(result);
});

async function doVerify(tokenId, guard, method) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query('SELECT * FROM visitors WHERE token_id=$1 FOR UPDATE', [tokenId]);
    const v = r.rows[0];
    if (!v) { await client.query('ROLLBACK'); return { ok: false, reason: 'Token not found' }; }

    const reject = async (reason) => {
      await client.query('ROLLBACK');
      await appendEntry(null, { actorId: guard.userId, actorRole: 'guard', action: 'VERIFY_FAIL', details: reason, tokenId });
      return { ok: false, reason };
    };

    if (v.status === 'revoked') return reject('Revoked');
    if (v.status === 'used')    return reject('Already used');
    if (v.status === 'expired') return reject('Expired');
    const now = Date.now();
    if (now < Date.parse(v.valid_from)) return reject('Not yet valid');
    if (now > Date.parse(v.valid_to))   return reject('Expired');

    await client.query('UPDATE visitors SET status=$1, used_at=now() WHERE id=$2', ['used', v.id]);
    await appendEntry(client, { actorId: guard.userId, actorRole: 'guard', action: 'CHECK_IN', details: `method=${method} visitor#${v.id}`, tokenId });
    await client.query('COMMIT');
    return {
      ok: true,
      visitor: { id: v.id, name: decField(v.name_enc), valid_to: v.valid_to, checked_in_at: new Date().toISOString() }
    };
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    return { ok: false, reason: 'Server error' };
  } finally { client.release(); }
}

// ---------- GUARD: exit ----------
app.post('/api/exit/:tokenId', auth(['guard']), async (req, res) => {
  const tokenId = req.params.tokenId;
  const r = await pool.query('SELECT * FROM visitors WHERE token_id=$1', [tokenId]);
  const v = r.rows[0];
  if (!v || v.status !== 'used') return res.status(400).json({ error: 'Cannot exit: not checked in' });
  await pool.query('UPDATE visitors SET exit_at=now() WHERE id=$1', [v.id]);
  await appendEntry(null, { actorId: req.user.userId, actorRole: 'guard', action: 'CHECK_OUT', details: `visitor#${v.id}`, tokenId });
  res.json({ ok: true });
});

// ---------- GUARD/ADMIN: currently inside ----------
app.get('/api/inside', auth(['guard', 'admin']), async (req, res) => {
  const r = await pool.query(
    `SELECT id,name_enc,purpose,used_at,token_id FROM visitors
     WHERE status='used' AND exit_at IS NULL ORDER BY used_at DESC`);
  res.json({
    visitors: r.rows.map(v => ({
      id: v.id, name: decField(v.name_enc), purpose: v.purpose,
      checked_in_at: v.used_at, token_id: v.token_id
    }))
  });
});

// ---------- GUARD: emergency override ----------
app.post('/api/emergency', auth(['guard']), async (req, res) => {
  const { name, phone, reason } = req.body || {};
  if (!name || !reason) return res.status(400).json({ error: 'name and reason required' });
  if (reason.length < 5) return res.status(400).json({ error: 'reason must be at least 5 chars' });

  const tokenId = 'EMG-' + crypto.randomBytes(6).toString('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO visitors
        (resident_id, name_enc, phone_enc, purpose, valid_from, valid_to,
         token_id, otp_hash, otp_expires, status, consent_given, used_at)
       VALUES (NULL,$1,$2,$3,now(),now()+interval '4 hours',$4,$5,now()+interval '4 hours','used',false,now())
       RETURNING id`,
      [encField(name), encField(phone || 'N/A'), 'EMERGENCY: ' + reason, tokenId, sha256('EMERGENCY')]
    );
    await appendEntry(client, {
      actorId: req.user.userId, actorRole: 'guard', action: 'EMERGENCY_OVERRIDE',
      details: `visitor#${ins.rows[0].id} reason=${reason}`, tokenId
    });
    await client.query('COMMIT');
    await sendAlert({ severity: 'high', message: `Emergency override by guard=${req.user.username}: ${name} (reason: ${reason})`, tokenId, actorId: req.user.userId });
    res.json({ ok: true, tokenId, id: ins.rows[0].id });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'failed' });
  } finally { client.release(); }
});

// ---------- ADMIN ----------
app.get('/api/admin/stats', auth(['admin']), async (req, res) => {
  const q = async (sql) => (await pool.query(sql)).rows[0].c;
  res.json({
    checkedIn:    await q(`SELECT count(*)::int AS c FROM visitors WHERE status='used' AND exit_at IS NULL`),
    checkedOut:   await q(`SELECT count(*)::int AS c FROM visitors WHERE exit_at IS NOT NULL`),
    denied:       await q(`SELECT count(*)::int AS c FROM ledger WHERE action='VERIFY_FAIL'`),
    emergency:    await q(`SELECT count(*)::int AS c FROM ledger WHERE action='EMERGENCY_OVERRIDE'`),
    totalLedger:  await q(`SELECT count(*)::int AS c FROM ledger`)
  });
});

app.get('/api/admin/ledger', auth(['admin']), async (req, res) => {
  const { action, tokenId, from, to, limit } = req.query;
  const conds = []; const params = [];
  if (action)  { params.push(action);  conds.push(`action=$${params.length}`); }
  if (tokenId) { params.push(tokenId); conds.push(`token_id=$${params.length}`); }
  if (from)    { params.push(from);    conds.push(`ts >= $${params.length}`); }
  if (to)      { params.push(to);      conds.push(`ts <= $${params.length}`); }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const lim = Math.min(Number(limit) || 200, 1000);
  params.push(lim);
  const r = await pool.query(`SELECT * FROM ledger ${where} ORDER BY id DESC LIMIT $${params.length}`, params);
  res.json({ entries: r.rows });
});

app.get('/api/admin/chain', auth(['admin']), async (req, res) => {
  res.json(await verifyChain(MAX_CHAIN_CHECK));
});

app.get('/api/admin/alerts', auth(['admin']), async (req, res) => {
  const r = await pool.query('SELECT * FROM alerts ORDER BY id DESC LIMIT 200');
  res.json({ alerts: r.rows });
});

// ---------- SPA fallback ----------
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== BOOT ====================
(async () => {
  try {
    await ensureDatabase();
    await ensureSchema();
    await seed();
    await purgeOld().catch(() => {});

    const start = () => console.log(`VisitVault running on ${process.env.TLS_CERT ? 'https' : 'http'}://localhost:${PORT}`);

    if (process.env.TLS_CERT && process.env.TLS_KEY) {
      const https = require('https');
      https.createServer(
        { key: fs.readFileSync(process.env.TLS_KEY), cert: fs.readFileSync(process.env.TLS_CERT), minVersion: 'TLSv1.3' },
        app
      ).listen(PORT, start);
    } else {
      app.listen(PORT, start);
    }
  } catch (e) {
    console.error('Boot failed:', e);
    process.exit(1);
  }
})();