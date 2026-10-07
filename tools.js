try { require('dotenv').config(); } catch (e) {}

const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/visitvault'
});
const BASE = 'http://localhost:' + (process.env.PORT || 3000);

async function login(username, password) {
  const r = await fetch(BASE + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  return r.json();
}

async function call(path, method, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(BASE + '/api' + path, {
    method: method || 'GET', headers,
    body: body ? JSON.stringify(body) : undefined
  });
  let data = {}; try { data = await r.json(); } catch (e) {}
  return { status: r.status, data };
}

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  \u2713', name); }
  else { fail++; console.log('  \u2717', name); }
}

async function runTests() {
  console.log('VisitVault automated test suite');
  console.log('================================');
  console.log('Assumes server is running on', BASE, '\n');

  const admin = await login('admin', 'admin123');
  const guard = await login('guard', 'guard123');
  const res1 = await login('resident', 'resident123');
  const res2 = await login('resident2', 'resident123');

  check('Admin login succeeds', !!admin.token);
  check('Guard login succeeds', !!guard.token);
  check('Resident login succeeds', !!res1.token);

  const from = new Date(Date.now() - 60000).toISOString();
  const to = new Date(Date.now() + 3600000).toISOString();

  const v = await call('/visitors', 'POST',
    { name: 'Test Visitor', phone: '9999999999', purpose: 'test',
      valid_from: from, valid_to: to, consent: true }, res1.token);
  check('Resident can create visitor pass', v.status === 200 && !!v.data.token);
  const { token } = v.data;

  const first = await call('/verify/qr', 'POST', { token }, guard.token);
  check('First QR verify PASS', first.data.ok === true);
  const second = await call('/verify/qr', 'POST', { token }, guard.token);
  check('Reused QR verify FAIL', second.data.ok === false && /Already used/i.test(second.data.reason || ''));

  const past = new Date(Date.now() - 3600000).toISOString();
  const past2 = new Date(Date.now() - 1800000).toISOString();
  const vExp = await call('/visitors', 'POST',
    { name: 'Expired Tester', phone: '8888888888', purpose: 't',
      valid_from: past, valid_to: past2, consent: true }, res1.token);
  if (vExp.status === 200) {
    const r = await call('/verify/qr', 'POST', { token: vExp.data.token }, guard.token);
    check('Expired QR verify FAIL', r.data.ok === false);
  } else {
    check('Expired QR create blocked (acceptable)', false);
  }

  const fake = jwt.sign(
    { sub: 'fake', residentId: 1,
      iat: Math.floor(Date.now() / 1000),
      nbf: Math.floor(Date.now() / 1000) - 60,
      exp: Math.floor(Date.now() / 1000) + 600 },
    'wrong-secret', { algorithm: 'HS256' });
  const fakeR = await call('/verify/qr', 'POST', { token: fake }, guard.token);
  check('Fake-signature token FAIL', fakeR.data.ok === false);

  const wrong = await call('/admin/stats', 'GET', null, guard.token);
  check('Guard blocked from admin route', wrong.status === 403);
  const wrong2 = await call('/visitors', 'POST',
    { name: 'x', phone: '1111111111', valid_from: from, valid_to: to, consent: true }, guard.token);
  check('Guard blocked from resident route', wrong2.status === 403);

  const res2List = await call('/visitors', 'GET', null, res2.token);
  check('Resident isolation (R2 sees none of R1\'s)',
    res2List.status === 200 && (res2List.data.visitors || []).every(x => x.id !== v.data.id));

  let triggerBlocked = false;
  try {
    await pool.query("UPDATE ledger SET details='HACKED' WHERE id=(SELECT min(id) FROM ledger)");
  } catch (e) { triggerBlocked = /append-only/i.test(e.message); }
  check('Ledger trigger blocks UPDATE (even for admin)', triggerBlocked);

  const chainNow = await call('/admin/chain', 'GET', null, admin.token);
  check('Chain verifies normally', chainNow.data.ok === true);

  console.log('');
  console.log(`Results: ${pass} passed, ${fail} failed`);
  await pool.end();
  process.exit(fail ? 1 : 0);
}

async function tamperDemo() {
  console.log('Simulating tampering on an old ledger row (bypassing the trigger once)...');
  const c = await pool.connect();
  try {
    await c.query("SET session_replication_role = replica");
    const r = await c.query("UPDATE ledger SET details='TAMPERED' WHERE id=(SELECT min(id)+1 FROM ledger)");
    await c.query("SET session_replication_role = DEFAULT");
    console.log('Updated', r.rowCount, 'row(s). Now checking chain...');
  } finally { c.release(); }

  const admin = await login('admin', 'admin123');
  const chain = await call('/admin/chain', 'GET', null, admin.token);
  if (chain.data.ok) console.log('Unexpected: chain still valid.');
  else console.log('Chain BREAKS at entry #' + chain.data.brokenId + ' — tamper detected.');
  await pool.end();
}

async function reset() {
  console.log('Dropping and recreating VisitVault tables...');
  await pool.query(`
    DROP TRIGGER IF EXISTS ledger_no_change ON ledger;
    DROP FUNCTION IF EXISTS block_ledger_mutation();
    DROP TABLE IF EXISTS alerts;
    DROP TABLE IF EXISTS ledger;
    DROP TABLE IF EXISTS visitors;
    DROP TABLE IF EXISTS users;
  `);
  const sql = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('Recreated. Restart the server to reseed.');
  await pool.end();
}

const cmd = process.argv[2] || 'test';
if (cmd === 'test') runTests().catch(e => { console.error(e); process.exit(1); });
else if (cmd === 'tamper') tamperDemo().catch(e => { console.error(e); process.exit(1); });
else if (cmd === 'reset') reset().catch(e => { console.error(e); process.exit(1); });
else console.log('Usage: node tools.js [test|tamper|reset]');