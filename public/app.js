/* ============================================================
   VisitVault frontend — Warm Light UI v5 (QR scanner fixed)
   ============================================================ */

const state = {
  token: localStorage.getItem('vv_token'),
  user: safeParse(localStorage.getItem('vv_user'))
};

function safeParse(s) { try { return JSON.parse(s); } catch (e) { return null; } }

/* ---------- DOM helpers ---------- */
function $(s, r = document) { return r.querySelector(s); }
function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'style') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else e.setAttribute(k, v);
  }
  for (const c of kids) {
    if (c == null || c === false) continue;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
}

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg, kind) {
  const t = $('#toast');
  t.classList.remove('hidden', 'ok', 'err');
  t.textContent = msg;
  if (kind) t.classList.add(kind);
  t.style.animation = 'none';
  void t.offsetHeight;
  t.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2800);
}

/* ---------- API with 401 interceptor ---------- */
let reauthInProgress = false;
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers.Authorization = 'Bearer ' + state.token;
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  let data = {};
  try { data = await res.json(); } catch (e) {}

  if (res.status === 401 && !reauthInProgress) {
    reauthInProgress = true;
    setSession(null, null);
    toast('Your session expired. Please sign in again.', 'err');
    route();
    reauthInProgress = false;
    const err = new Error('Not signed in');
    err.status = 401;
    throw err;
  }

  if (!res.ok) {
    const err = new Error(data.error || ('HTTP ' + res.status));
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ---------- Session ---------- */
function setSession(token, user) {
  state.token = token; state.user = user;
  if (token) {
    localStorage.setItem('vv_token', token);
    localStorage.setItem('vv_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('vv_token');
    localStorage.removeItem('vv_user');
  }
  renderTopbar();
}

function initials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function renderTopbar() {
  const bar = $('#topbar');
  const u = $('#userinfo');
  clear(u);
  if (state.user) {
    bar.classList.remove('hidden');
    const name = state.user.full_name || state.user.username;
    u.appendChild(el('div', { class: 'user-chip' },
      el('div', { class: 'avatar' }, initials(name)),
      el('div', { class: 'user-meta' },
        el('div', { class: 'user-name' }, name),
        el('div', { class: 'user-role' }, state.user.role)
      )
    ));
  } else {
    bar.classList.add('hidden');
  }
}

/* ---------- Formatting ---------- */
function fmt(iso) {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata', hour12: false,
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch (e) { return iso; }
}

/* ============================================================
   LOGIN VIEW
   ============================================================ */
function viewLogin() {
  const main = $('#main'); clear(main);

  const username = el('input', { placeholder: 'e.g. resident', autocomplete: 'username', autofocus: '' });
  const password = el('input', { type: 'password', placeholder: 'Your password', autocomplete: 'current-password' });
  const errBox = el('div', { class: 'login-error' });

  const doLogin = async (e) => {
    e.preventDefault();
    errBox.textContent = '';
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      const r = await api('/login', {
        method: 'POST',
        body: { username: username.value.trim(), password: password.value }
      });
      setSession(r.token, r.user);
      route();
    } catch (err) {
      errBox.textContent = '⚠ ' + err.message;
      btn.disabled = false; btn.textContent = 'Sign in';
    }
  };

  main.appendChild(el('div', { class: 'login-wrap' },
    el('div', { class: 'login-shell' },
      el('div', { class: 'login-hero' },
        el('div', { class: 'login-brand' },
          el('span', { class: 'brand-icon' }, '🔐'),
          el('span', { class: 'brand-name' }, 'VisitVault')
        ),
        el('p', { class: 'login-tagline' },
          'A tamper-evident digital visitor management system for hostels, offices, and gated communities.'),
        el('ul', { class: 'login-features' },
          el('li', {}, 'Cryptographically signed QR passes'),
          el('li', {}, 'Single-use enforcement — no double entry'),
          el('li', {}, 'AES-256-GCM field-level encryption'),
          el('li', {}, 'SHA-256 append-only audit ledger'),
          el('li', {}, 'DPDP-compliant consent & 180-day retention')
        )
      ),
      el('div', { class: 'login-form' },
        el('h2', {}, 'Welcome back'),
        el('p', { class: 'card-sub' }, 'Sign in to continue to your dashboard'),
        el('form', { onsubmit: doLogin },
          el('label', {}, 'Username'),
          username,
          el('label', {}, 'Password'),
          password,
          el('button', { class: 'primary', type: 'submit', style: { marginTop: '20px', width: '100%' } }, 'Sign in'),
          errBox
        ),
        el('div', { class: 'demo-box' },
          el('strong', {}, 'Demo accounts'),
          el('div', { class: 'demo-row' }, el('span', {}, 'Admin'),    el('code', {}, 'admin / admin123')),
          el('div', { class: 'demo-row' }, el('span', {}, 'Guard'),    el('code', {}, 'guard / guard123')),
          el('div', { class: 'demo-row' }, el('span', {}, 'Resident'), el('code', {}, 'resident / resident123'))
        )
      )
    )
  ));
}

/* ============================================================
   RESIDENT VIEW
   ============================================================ */
async function viewResident() {
  const main = $('#main'); clear(main);

  const name = state.user.full_name || state.user.username;
  main.appendChild(el('div', { class: 'page-header' },
    el('div', {},
      el('div', { class: 'page-title' }, `Hello, ${name.split(' ')[0]} 👋`),
      el('div', { class: 'page-sub' }, 'Pre-register visitors and manage their passes')
    )
  ));

  const statsCard = el('div');
  main.appendChild(statsCard);

  main.appendChild(el('div', { class: 'card' },
    el('div', { class: 'card-header' },
      el('div', {},
        el('h3', {}, 'Pre-register a Visitor'),
        el('div', { class: 'card-sub' }, 'Issue a signed QR pass with a short-lived OTP fallback')
      )
    ),
    buildResidentForm()
  ));

  const listCard = el('div', { class: 'card' },
    el('div', { class: 'card-header' },
      el('div', {},
        el('h3', {}, 'My Visitors'),
        el('div', { class: 'card-sub' }, 'Passes you have issued')
      ),
      el('button', { class: 'small', type: 'button', onclick: () => refreshResidentList(listCard, statsCard) }, '↻ Refresh')
    ),
    el('div', { id: 'residentList' })
  );
  main.appendChild(listCard);

  await refreshResidentList(listCard, statsCard);
}

function buildResidentForm() {
  const name = el('input', { placeholder: 'e.g. John Doe' });
  const phone = el('input', { placeholder: '10-digit mobile number', inputmode: 'tel' });
  const email = el('input', { type: 'email', placeholder: 'visitor@example.com', autocomplete: 'email', required: '' });
  const purpose = el('input', { placeholder: 'e.g. Family visit, Delivery, Meeting' });
  const from = el('input', { type: 'datetime-local' });
  const to = el('input', { type: 'datetime-local' });
  const consent = el('input', { type: 'checkbox' });
  const msg = el('div', { class: 'muted', style: { marginTop: '10px' } });

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const toLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  from.value = toLocal(now);
  to.value = toLocal(new Date(now.getTime() + 60 * 60 * 1000));

  const submit = async (e) => {
    e.preventDefault();
    msg.textContent = '';
    if (!name.value.trim() || !phone.value.trim() || !email.value.trim()) { msg.textContent = '⚠ Name, phone, and visitor email are required'; return; }
    if (!consent.checked) { msg.textContent = '⚠ Please confirm visitor consent before issuing the pass'; return; }

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Issuing pass and sending email…';
    try {
      const r = await api('/visitors', { method: 'POST', body: {
        name: name.value.trim(),
        phone: phone.value.trim(),
        email: email.value.trim(),
        purpose: purpose.value.trim(),
        valid_from: from.value,
        valid_to: to.value,
        consent: true
      }});
      showPassModal(r);
      name.value = ''; phone.value = ''; email.value = ''; purpose.value = '';
      if (r.emailSent) toast('Pass issued and emailed to the visitor', 'ok');
      else toast('Pass issued, but visitor email was not sent', 'err');
      const listCard = document.querySelector('main .card:last-of-type');
      const statsCard = document.querySelector('main > div:nth-child(2)');
      if (listCard) refreshResidentList(listCard, statsCard);
    } catch (err) {
      msg.textContent = '⚠ ' + err.message;
    } finally {
      btn.disabled = false; btn.textContent = 'Issue Visitor Pass';
    }
  };

  return el('form', { onsubmit: submit },
    el('div', { class: 'form-grid' },
      el('div', {},       el('label', {}, 'Visitor full name'), name),
      el('div', {}, el('label', {}, 'Visitor email (QR pass will be sent here)'), email),
      el('div', {}, el('label', {}, 'Phone number'), phone),
      el('div', {}, el('label', {}, 'Purpose of visit'), purpose),
      el('div', {}, el('label', {}, 'Valid from'), from),
      el('div', {}, el('label', {}, 'Valid until'), to)
    ),
    el('div', { class: 'consent' },
      consent,
      el('span', {}, "I have obtained the visitor's informed consent to store their name, phone number, and email address, and to send their QR pass by email. This data will be auto-purged after 180 days.")
    ),
    el('button', { class: 'primary', type: 'submit' }, 'Issue Visitor Pass'),
    msg
  );
}

async function refreshResidentList(card, statsCard) {
  const listBox = card.querySelector('#residentList');
  if (!listBox) return;
  clear(listBox);
  listBox.appendChild(el('div', { class: 'muted', style: { padding: '20px 0' } }, 'Loading…'));

  try {
    const { visitors } = await api('/visitors');
    clear(listBox);

    if (statsCard) {
      clear(statsCard);
      const total   = visitors.length;
      const active  = visitors.filter(v => v.status === 'active').length;
      const used    = visitors.filter(v => v.status === 'used').length;
      const expired = visitors.filter(v => v.status === 'expired' || v.status === 'revoked').length;
      statsCard.appendChild(el('div', { class: 'grid grid-4' },
        statCard('🎫', total,   'Total passes',        'info'),
        statCard('✅', active,  'Active',              'success'),
        statCard('🚪', used,    'Used',                'warn'),
        statCard('⏳', expired, 'Expired / Revoked',   'danger')
      ));
    }

    if (!visitors.length) {
      listBox.appendChild(el('div', { class: 'empty-state' },
        el('span', { class: 'icon' }, '🎫'),
        'No visitors yet. Issue your first pass above.'
      ));
      return;
    }

    const wrap = el('div', { class: 'table-wrap' });
    const tbl = el('table');
    tbl.appendChild(el('thead', {}, el('tr', {},
      el('th', {}, 'Visitor'), el('th', {}, 'Contact'),
      el('th', {}, 'Valid from'), el('th', {}, 'Valid until'),
      el('th', {}, 'Status'), el('th', {}, 'Actions')
    )));
    const tb = el('tbody');
    for (const v of visitors) {
      const actions = el('td');
      if (v.status === 'active') {
        actions.appendChild(el('button', {
          class: 'small', type: 'button', style: { marginRight: '6px' },
          onclick: async () => {
            if (!confirm('Revoke this pass? The visitor will no longer be able to enter.')) return;
            try {
              await api('/visitors/' + v.id + '/revoke', { method: 'POST' });
              toast('Pass revoked', 'ok');
              refreshResidentList(card, statsCard);
            } catch (e) { toast(e.message, 'err'); }
          }
        }, 'Revoke'));
        actions.appendChild(el('button', {
          class: 'small', type: 'button',
          onclick: async () => {
            try {
              const r = await api('/visitors/' + v.id + '/new-otp', { method: 'POST' });
              showPassModal({ otp: r.otp, otpTtlSec: r.otpTtlSec, tokenId: v.token_id, isOtpOnly: true });
            } catch (e) { toast(e.message, 'err'); }
          }
        }, 'New OTP'));
      } else {
        actions.appendChild(el('span', { class: 'muted' }, '—'));
      }
      tb.appendChild(el('tr', {},
        el('td', {},
          el('strong', { style: { color: 'var(--text)' } }, v.name),
          el('div', { class: 'muted', style: { fontSize: '12px' } }, v.purpose || 'No purpose specified')
        ),
        el('td', {}, v.phone),
        el('td', {}, fmt(v.valid_from)),
        el('td', {}, fmt(v.valid_to)),
        el('td', {}, el('span', { class: 'badge ' + v.status }, v.status)),
        actions
      ));
    }
    tbl.appendChild(tb);
    wrap.appendChild(tbl);
    listBox.appendChild(wrap);
  } catch (e) {
    clear(listBox);
    if (e.status !== 401) {
      listBox.appendChild(el('div', { class: 'empty-state' }, 'Error: ' + e.message));
    }
  }
}

function statCard(icon, num, lbl, variant) {
  return el('div', { class: 'stat stat-' + (variant || 'info') },
    el('div', { class: 'stat-icon' }, icon),
    el('div', { class: 'stat-body' },
      el('div', { class: 'num' }, String(num)),
      el('div', { class: 'lbl' }, lbl)
    )
  );
}

/* ---------- Pass modal ---------- */
function showPassModal(r) {
  const old = $('#passModal'); if (old) old.remove();

  const content = [];
  content.push(el('h2', {}, r.isOtpOnly ? 'New OTP issued' : (r.emailSent ? '🎫 Visitor Pass Issued and Emailed' : '🎫 Visitor Pass Issued')));
  content.push(el('p', { class: 'card-sub' }, r.isOtpOnly
    ? 'Share this OTP with the visitor. It expires shortly.'
    : (r.emailSent
      ? `The QR pass was emailed to ${r.visitorEmail || 'the visitor'}. Keep this copy as a backup.`
      : 'The QR pass could not be emailed. Use this copy as a backup and check the email setup.')));

  if (!r.isOtpOnly && typeof r.emailSent === 'boolean') {
    content.push(el('div', {
      style: {
        marginTop: '12px', padding: '10px 12px', borderRadius: 'var(--radius)',
        border: '1px solid var(--border)', background: 'var(--surface-warm)', color: 'var(--text)'
      }
    }, r.emailSent
      ? `✅ Email sent to ${r.visitorEmail || 'visitor'}.`
      : `⚠ Email was not sent: ${r.emailError || 'SMTP is not configured or delivery failed.'}`));
  }

  if (r.qr) {
    content.push(el('div', { style: { display: 'grid', placeItems: 'center', margin: '18px 0' } },
      el('img', { class: 'qr', src: r.qr, alt: 'QR code' })
    ));
  }

  content.push(el('div', { style: { textAlign: 'center', margin: '12px 0' } },
    el('div', { class: 'muted', style: { marginBottom: '6px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: '700' } }, 'Backup OTP'),
    el('div', { class: 'otp' }, r.otp)
  ));

  const ttlLabel = el('strong', {}, String(r.otpTtlSec));
  content.push(el('div', {
    style: {
      background: 'var(--surface-warm)', padding: '12px 14px',
      borderRadius: 'var(--radius)', border: '1px solid var(--border)',
      fontSize: '12.5px', color: 'var(--text-soft)', marginTop: '12px'
    }
  },
    el('div', { style: { marginBottom: '4px' } }, '⏱ OTP valid for ', ttlLabel, ' seconds'),
    el('div', {}, '🔖 Token ID: ', el('span', { class: 'hash' }, r.tokenId || '—'))
  ));

  if (r.token) {
    const tokenArea = el('textarea', {
      readonly: '',
      style: {
        width: '100%', marginTop: '12px', fontFamily: 'ui-monospace, monospace',
        fontSize: '11px', minHeight: '54px', resize: 'none'
      }
    });
    tokenArea.value = r.token;
    content.push(el('div', {},
      el('div', { class: 'muted', style: { fontSize: '12px', marginTop: '12px', marginBottom: '4px' } },
        "Token (for the Guard's paste fallback):"),
      tokenArea,
      el('button', {
        type: 'button',
        style: { marginTop: '6px' },
        onclick: () => {
          tokenArea.select();
          try { document.execCommand('copy'); toast('Token copied', 'ok'); } catch (e) {}
        }
      }, '📋 Copy token')
    ));
  }

  content.push(el('div', { style: { display: 'flex', gap: '8px', marginTop: '20px', justifyContent: 'flex-end' } },
    el('button', { type: 'button', onclick: () => window.print() }, '🖨 Print'),
    el('button', { class: 'primary', type: 'button', onclick: () => box.remove() }, 'Done')
  ));

  const box = el('div', { id: 'passModal', class: 'modal' },
    el('div', { class: 'modalbox' }, ...content)
  );
  box.addEventListener('click', (e) => { if (e.target === box) box.remove(); });
  document.body.appendChild(box);

  let remaining = Number(r.otpTtlSec) || 120;
  const iv = setInterval(() => {
    remaining--;
    if (remaining < 0 || !document.body.contains(box)) { clearInterval(iv); return; }
    ttlLabel.textContent = String(remaining);
  }, 1000);
}

/* ============================================================
   GUARD VIEW — QR scanning with local jsQR + diagnostics
   ============================================================ */
let cameraStream = null;
let scanInterval = null;
let scanCanvas = null;
let scanFrameCount = 0;
let scanStatusEl = null;

async function viewGuard() {
  const main = $('#main'); clear(main);
  stopCamera();

  main.appendChild(el('div', { class: 'page-header' },
    el('div', {},
      el('div', { class: 'page-title' }, '🛡 Guard Terminal'),
      el('div', { class: 'page-sub' }, 'Verify visitor passes and manage gate access')
    )
  ));

  const result = el('div', { id: 'guardResult', class: 'bigresult hidden' });
  main.appendChild(result);

  /* --- Scanner card --- */
  const video = el('video', { class: 'camera', playsinline: '', muted: '', autoplay: '' });
  const scanMsg = el('div', { class: 'scan-hint' });
  scanStatusEl = el('div', {
    class: 'muted',
    style: {
      marginTop: '8px',
      padding: '8px 12px',
      background: 'var(--surface-warm)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      fontFamily: 'ui-monospace, monospace',
      fontSize: '12px'
    }
  }, 'Scanner: initialising…');
  const pasteWrap = el('div');
  const scannerCard = el('div', { class: 'card' },
    el('div', { class: 'card-header' },
      el('div', {},
        el('h3', {}, '📷 Scan QR Code'),
        el('div', { class: 'card-sub' }, "Point the camera at the visitor's QR code")
      ),
      el('button', { class: 'small', type: 'button', onclick: stopCamera }, 'Stop camera')
    ),
    el('div', { style: { display: 'grid', placeItems: 'center' } }, video, scanMsg),
    scanStatusEl,
    pasteWrap
  );

  /* --- Manual OTP card --- */
  const otp = el('input', {
    placeholder: '000000', maxlength: '6', inputmode: 'numeric',
    style: { fontSize: '22px', textAlign: 'center', letterSpacing: '0.3em', fontWeight: '700' }
  });
  const manualCard = el('div', { class: 'card' },
    el('div', { class: 'card-header' },
      el('div', {},
        el('h3', {}, '⌨ Manual OTP Entry'),
        el('div', { class: 'card-sub' }, 'Fallback if the camera fails')
      )
    ),
    el('form', { onsubmit: async (e) => {
      e.preventDefault();
      try {
        const r = await api('/verify/otp', { method: 'POST', body: { otp: otp.value.trim() } });
        showResult(result, r);
        otp.value = '';
        refreshInside(insideCard);
      } catch (err) {
        showResult(result, { ok: false, reason: err.message });
      }
    }},
      otp,
      el('button', { class: 'primary', type: 'submit', style: { marginTop: '12px', width: '100%' } }, 'Verify OTP')
    )
  );

  main.appendChild(el('div', { class: 'grid-guard' }, scannerCard, manualCard));

  /* --- Emergency override --- */
  const emName   = el('input', { placeholder: 'Visitor name' });
  const emPhone  = el('input', { placeholder: 'Phone (optional)' });
  const emReason = el('textarea', { placeholder: 'Why is this emergency entry being allowed? (min 5 characters)' });
  const emMsg    = el('div', { class: 'muted', style: { marginTop: '8px' } });

  main.appendChild(el('div', { class: 'card' },
    el('div', { class: 'card-header' },
      el('div', {},
        el('h3', {}, '🚨 Emergency Override'),
        el('div', { class: 'card-sub' }, 'Instant access. This action raises a high-severity alert.')
      )
    ),
    el('form', { onsubmit: async (e) => {
      e.preventDefault();
      if (!emName.value.trim() || emReason.value.trim().length < 5) {
        emMsg.textContent = '⚠ Name and a reason of at least 5 characters are required.';
        return;
      }
      try {
        const r = await api('/emergency', { method: 'POST', body: {
          name: emName.value.trim(),
          phone: emPhone.value.trim(),
          reason: emReason.value.trim()
        }});
        emMsg.textContent = '✅ Emergency entry recorded · ' + r.tokenId;
        emName.value = ''; emPhone.value = ''; emReason.value = '';
        toast('Emergency entry logged', 'ok');
        refreshInside(insideCard);
      } catch (err) {
        emMsg.textContent = '⚠ ' + err.message;
      }
    }},
      el('div', { class: 'form-grid' },
        el('div', {}, el('label', {}, 'Visitor name'), emName),
        el('div', {}, el('label', {}, 'Phone'), emPhone)
      ),
      el('label', {}, 'Reason (required)'),
      emReason,
      el('button', { class: 'danger', type: 'submit', style: { marginTop: '14px' } }, 'Authorize Emergency Entry'),
      emMsg
    )
  ));

  /* --- Currently inside --- */
  const insideCard = el('div', { class: 'card' },
    el('div', { class: 'card-header' },
      el('div', {},
        el('h3', {}, '👥 Currently Inside'),
        el('div', { class: 'card-sub' }, 'Visitors who have checked in but not yet exited')
      ),
      el('button', { class: 'small', type: 'button', onclick: () => refreshInside(insideCard) }, '↻ Refresh')
    ),
    el('div', { id: 'insideList' })
  );
  main.appendChild(insideCard);
  await refreshInside(insideCard);

  // Ensure jsQR is ready before starting
  const ok = await ensureJsQR();
  setScanStatus(ok ? 'ready' : 'no-lib');

  // Kick off the camera + scan loop
  await startCamera(video, scanMsg, pasteWrap, result, () => refreshInside(insideCard));
}

/* ---------- jsQR loader (local first, CDN fallback) ---------- */
function loadScript(src) {
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}

async function ensureJsQR() {
  if (typeof window.jsQR === 'function') return true;
  // Local copy served by the backend
  await loadScript('/vendor/jsQR.js');
  if (typeof window.jsQR === 'function') return true;
  // CDN fallbacks (in case the local copy is missing)
  const cdns = [
    'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',
    'https://unpkg.com/jsqr@1.4.0/dist/jsQR.js'
  ];
  for (const c of cdns) {
    await loadScript(c);
    if (typeof window.jsQR === 'function') return true;
  }
  return false;
}

function setScanStatus(stateText) {
  if (!scanStatusEl) return;
  const has = typeof window.jsQR === 'function';
  let status;
  if (stateText === 'ready' && has) {
    status = '✅ Scanner ready (jsQR loaded locally)';
  } else if (!has) {
    status = '⚠ Scanner not ready — jsQR failed to load. Use the paste fallback below.';
  } else {
    status = '✅ Scanner ready';
  }
  scanStatusEl.textContent = status;
}

/* ---------- Camera lifecycle ---------- */
function stopCamera() {
  if (scanInterval) { clearInterval(scanInterval); scanInterval = null; }
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
}

async function startCamera(video, msg, pasteWrap, resultBox, onSuccess) {
  clear(msg);
  clear(pasteWrap);

  // --- Always show the paste fallback ---
  const pasteInput = el('input', {
    placeholder: "Paste the QR JWT token (from the resident's pass modal)",
    style: { marginTop: '12px', fontFamily: 'ui-monospace, monospace', fontSize: '12px' }
  });
  const pasteBtn = el('button', {
    class: 'primary', type: 'button', style: { marginTop: '8px' },
    onclick: async () => {
      const token = pasteInput.value.trim();
      if (!token) return;
      try {
        const r = await api('/verify/qr', { method: 'POST', body: { token } });
        showResult(resultBox, r);
        if (r.ok && onSuccess) onSuccess();
      } catch (e) {
        showResult(resultBox, { ok: false, reason: e.message });
      }
    }
  }, 'Verify pasted token');
  pasteWrap.appendChild(el('div', { class: 'card-sub', style: { marginTop: '14px' } },
    'Fallback — paste the raw QR token here if the camera cannot scan it:'));
  pasteWrap.appendChild(pasteInput);
  pasteWrap.appendChild(pasteBtn);

  // --- Open the camera ---
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
  } catch (e) {
    clear(msg);
    msg.appendChild(el('span', {}, '⚠'));
    msg.appendChild(el('span', {}, 'Camera unavailable: ' + e.message + '. Use Manual OTP or the paste fallback below.'));
    return;
  }

  video.srcObject = cameraStream;
  try { await video.play(); } catch (e) {}

  // Wait until video dimensions are known
  await new Promise((resolve) => {
    if (video.videoWidth && video.videoHeight) return resolve();
    const onMeta = () => { video.removeEventListener('loadedmetadata', onMeta); resolve(); };
    video.addEventListener('loadedmetadata', onMeta);
    setTimeout(resolve, 1500); // safety
  });

  clear(msg);
  msg.appendChild(el('span', {}, '📸'));
  msg.appendChild(el('span', {}, "Point the camera at the visitor's QR code and hold it steady."));

  // Create the offscreen canvas used for frame decoding
  if (!scanCanvas) scanCanvas = document.createElement('canvas');

  // Optional fast path via native BarcodeDetector
  let detector = null;
  if ('BarcodeDetector' in window) {
    try {
      const fmts = await window.BarcodeDetector.getSupportedFormats();
      if (fmts && fmts.includes('qr_code')) {
        detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      }
    } catch (e) { detector = null; }
  }

  scanFrameCount = 0;
  startScanLoop(video, detector, resultBox, onSuccess);
}

function startScanLoop(video, detector, resultBox, onSuccess) {
  if (!scanCanvas) return;
  const ctx = scanCanvas.getContext('2d', { willReadFrequently: true });

  scanInterval = setInterval(async () => {
    if (!cameraStream) return;
    if (video.readyState < 2) return;

    const w = video.videoWidth | 0;
    const h = video.videoHeight | 0;
    if (!w || !h) return;

    if (scanCanvas.width !== w)  scanCanvas.width  = w;
    if (scanCanvas.height !== h) scanCanvas.height = h;

    ctx.drawImage(video, 0, 0, w, h);

    let token = null;
    let source = '';

    // 1) Try BarcodeDetector (fast but often unavailable on desktop)
    if (detector) {
      try {
        const codes = await detector.detect(scanCanvas);
        if (codes && codes.length) { token = codes[0].rawValue; source = 'BarcodeDetector'; }
      } catch (e) {}
    }

    // 2) Fall back to jsQR (works everywhere)
    if (!token && typeof window.jsQR === 'function') {
      try {
        const img = ctx.getImageData(0, 0, w, h);
        const code = window.jsQR(img.data, w, h, { inversionAttempts: 'attemptBoth' });
        if (code && code.data) { token = code.data; source = 'jsQR'; }
      } catch (e) {}
    }

    scanFrameCount++;

    // Update on-screen status every 10 frames
    if (scanFrameCount % 10 === 0) {
      const has = typeof window.jsQR === 'function';
      if (!has && !detector) {
        scanStatusEl.textContent = '⚠ Scanner not ready — jsQR failed to load. Use the paste fallback below.';
      } else if (token) {
        scanStatusEl.textContent = `✅ QR decoded via ${source} (frame ${scanFrameCount})`;
      } else {
        const engines = [];
        if (detector) engines.push('BarcodeDetector');
        if (has) engines.push('jsQR');
        scanStatusEl.textContent = `🔍 Scanning… frames=${scanFrameCount} engine=${engines.join('+')}`;
      }
    }

    if (!token) return;

    // Pause the loop while we verify
    clearInterval(scanInterval); scanInterval = null;

    token = String(token).trim();
    try {
      const r = await api('/verify/qr', { method: 'POST', body: { token } });
      showResult(resultBox, r);
      if (r.ok && onSuccess) onSuccess();
    } catch (e) {
      showResult(resultBox, { ok: false, reason: e.message });
    }

    // Resume after a short cooldown
    setTimeout(() => {
      if (cameraStream && !scanInterval) startScanLoop(video, detector, resultBox, onSuccess);
    }, 2500);
  }, 250);
}

function showResult(box, r) {
  box.classList.remove('hidden', 'pass', 'fail');
  clear(box);
  if (r.ok) {
    box.classList.add('pass');
    box.appendChild(el('div', { class: 'verdict' }, 'PASS'));
    box.appendChild(el('div', { class: 'visitor-name' }, r.visitor.name));
    box.appendChild(el('div', { class: 'meta' }, 'Valid until ' + fmt(r.visitor.valid_to)));
    playBeep(880, 0.15);
  } else {
    box.classList.add('fail');
    box.appendChild(el('div', { class: 'verdict' }, 'FAIL'));
    box.appendChild(el('div', { class: 'reason' }, r.reason || 'Rejected'));
    playBeep(220, 0.3);
  }
  if (r.elapsedMs != null)
    box.appendChild(el('div', { class: 'meta' }, `⚡ Verified in ${r.elapsedMs} ms`));
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function playBeep(freq, dur) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.connect(gain); gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    osc.start(); osc.stop(ctx.currentTime + dur);
  } catch (e) {}
}

async function refreshInside(card) {
  const listBox = card.querySelector('#insideList');
  if (!listBox) return;
  clear(listBox);
  listBox.appendChild(el('div', { class: 'muted', style: { padding: '16px 0' } }, 'Loading…'));
  try {
    const { visitors } = await api('/inside');
    clear(listBox);
    if (!visitors.length) {
      listBox.appendChild(el('div', { class: 'empty-state' },
        el('span', { class: 'icon' }, '👥'),
        'No visitors currently inside.'
      ));
      return;
    }
    const wrap = el('div', { class: 'table-wrap' });
    const tbl = el('table');
    tbl.appendChild(el('thead', {}, el('tr', {},
      el('th', {}, 'Visitor'), el('th', {}, 'Purpose'), el('th', {}, 'Checked in'), el('th', {}, '')
    )));
    const tb = el('tbody');
    for (const v of visitors) {
      tb.appendChild(el('tr', {},
        el('td', {}, el('strong', { style: { color: 'var(--text)' } }, v.name)),
        el('td', {}, v.purpose || '—'),
        el('td', {}, fmt(v.checked_in_at)),
        el('td', {}, el('button', {
          class: 'small', type: 'button',
          onclick: async () => {
            try {
              await api('/exit/' + v.token_id, { method: 'POST' });
              toast('Exit recorded', 'ok');
              refreshInside(card);
            } catch (e) { toast(e.message, 'err'); }
          }
        }, 'Record Exit'))
      ));
    }
    tbl.appendChild(tb);
    wrap.appendChild(tbl);
    listBox.appendChild(wrap);
  } catch (e) {
    clear(listBox);
    if (e.status !== 401) listBox.appendChild(el('div', { class: 'empty-state' }, 'Error: ' + e.message));
  }
}

/* ============================================================
   ADMIN VIEW
   ============================================================ */
let chainAuto = null;

async function viewAdmin() {
  const main = $('#main'); clear(main);
  if (chainAuto) { clearInterval(chainAuto); chainAuto = null; }

  main.appendChild(el('div', { class: 'page-header' },
    el('div', {},
      el('div', { class: 'page-title' }, '⚙ Admin Dashboard'),
      el('div', { class: 'page-sub' }, 'Live metrics, tamper-evident ledger, and security alerts')
    ),
    el('button', { class: 'small', type: 'button', onclick: () => viewAdmin() }, '↻ Refresh all')
  ));

  const statsCard = el('div');
  main.appendChild(statsCard);

  const chainCard = el('div');
  main.appendChild(chainCard);

  const ledgerCard = el('div', { class: 'card' },
    el('div', { class: 'card-header' },
      el('div', {},
        el('h3', {}, '📒 Audit Ledger'),
        el('div', { class: 'card-sub' }, 'Append-only. Every write is bound to an actor (non-repudiation).')
      )
    ),
    el('div', { id: 'ledgerFilters' }),
    el('div', { id: 'ledgerList' })
  );

  const alertsCard = el('div', { class: 'card' },
    el('div', { class: 'card-header' },
      el('div', {},
        el('h3', {}, '🚨 Security Alerts'),
        el('div', { class: 'card-sub' }, 'High-severity events logged automatically')
      ),
      el('button', { class: 'small', type: 'button', onclick: () => refreshAlerts(alertsCard) }, '↻ Refresh')
    ),
    el('div', { id: 'alertsList' })
  );

  main.appendChild(el('div', { class: 'grid-admin' }, ledgerCard, alertsCard));

  await refreshStats(statsCard);
  await refreshChain(chainCard);
  buildLedgerFilters(ledgerCard);
  await refreshLedger(ledgerCard, {});
  await refreshAlerts(alertsCard);

  chainAuto = setInterval(() => refreshChain(chainCard), 15000);
}

async function refreshStats(card) {
  clear(card);
  try {
    const s = await api('/admin/stats');
    card.appendChild(el('div', { class: 'grid grid-4' },
      statCard('🚪', s.checkedIn,  'Currently Inside', 'success'),
      statCard('✅', s.checkedOut, 'Completed Visits', 'info'),
      statCard('⛔', s.denied,     'Denied Attempts',  'danger'),
      statCard('🚨', s.emergency,  'Emergency Entries','warn')
    ));
  } catch (e) {
    if (e.status !== 401) card.appendChild(el('div', { class: 'empty-state' }, 'Error: ' + e.message));
  }
}

async function refreshChain(card) {
  clear(card);
  try {
    const c = await api('/admin/chain');
    const ok = c.ok;
    card.appendChild(el('div', { class: 'chain-banner' + (ok ? '' : ' broken') },
      el('div', { class: 'chain-icon' }, ok ? '🛡' : '⚠'),
      el('div', { style: { flex: 1, minWidth: 0 } },
        el('div', { class: 'chain-title' }, ok ? 'Ledger Chain Verified' : 'Ledger Chain BROKEN'),
        el('div', { class: 'chain-sub' },
          ok
            ? `All ${c.scanned} entries checked. The audit log has not been tampered with.`
            : `Entry #${c.brokenId} fails hash verification (scanned ${c.scanned} entries).`
        ),
        el('div', { class: 'chain-head' }, 'Head hash: ' + (c.head || '—'))
      ),
      el('button', { class: 'small', type: 'button', onclick: () => refreshChain(card) }, '🔄 Verify now')
    ));
  } catch (e) {
    if (e.status !== 401) card.appendChild(el('div', { class: 'empty-state' }, 'Error: ' + e.message));
  }
}

function buildLedgerFilters(ledgerCard) {
  const box = ledgerCard.querySelector('#ledgerFilters');
  clear(box);

  const action = el('select');
  ['', 'LOGIN', 'LOGOUT', 'TOKEN_ISSUED', 'OTP_REISSUED', 'REVOKE', 'CHECK_IN', 'CHECK_OUT',
   'VERIFY_FAIL', 'EMERGENCY_OVERRIDE', 'SEED']
    .forEach(a => action.appendChild(el('option', { value: a }, a || 'All actions')));

  const tokenId = el('input', { placeholder: 'Filter by token ID' });
  const from    = el('input', { type: 'datetime-local' });
  const to      = el('input', { type: 'datetime-local' });
  const limit   = el('input', { type: 'number', value: '200', min: '1', max: '1000' });

  const apply = async () => {
    const q = {};
    if (action.value)  q.action  = action.value;
    if (tokenId.value) q.tokenId = tokenId.value.trim();
    if (from.value)    q.from    = new Date(from.value).toISOString();
    if (to.value)      q.to      = new Date(to.value).toISOString();
    q.limit = limit.value;
    await refreshLedger(ledgerCard, q);
  };

  box.appendChild(el('div', { class: 'filter-bar' },
    el('div', {}, el('label', {}, 'Action'),   action),
    el('div', {}, el('label', {}, 'Token ID'), tokenId),
    el('div', {}, el('label', {}, 'From'),     from),
    el('div', {}, el('label', {}, 'To'),       to),
    el('div', {}, el('label', {}, 'Limit'),    limit),
    el('div', { style: { display: 'flex', gap: '8px' } },
      el('button', { class: 'primary', type: 'button', onclick: apply }, 'Apply'),
      el('button', { type: 'button', onclick: async () => {
        action.value = ''; tokenId.value = ''; from.value = ''; to.value = ''; limit.value = '200';
        await refreshLedger(ledgerCard, {});
      }}, 'Reset')
    )
  ));
}

async function refreshLedger(card, q) {
  const listBox = card.querySelector('#ledgerList');
  if (!listBox) return;
  clear(listBox);
  listBox.appendChild(el('div', { class: 'muted', style: { padding: '16px 0' } }, 'Loading…'));
  try {
    const qs = new URLSearchParams(q).toString();
    const { entries } = await api('/admin/ledger?' + qs);
    clear(listBox);
    if (!entries.length) {
      listBox.appendChild(el('div', { class: 'empty-state' }, 'No ledger entries match these filters.'));
      return;
    }
    const wrap = el('div', { class: 'table-wrap' });
    const tbl = el('table', { class: 'ledger' });
    tbl.appendChild(el('thead', {}, el('tr', {},
      el('th', {}, 'ID'), el('th', {}, 'Time (IST)'), el('th', {}, 'Actor'),
      el('th', {}, 'Action'), el('th', {}, 'Details'), el('th', {}, 'Token'),
      el('th', {}, 'Hash'), el('th', {}, 'Prev')
    )));
    const tb = el('tbody');
    for (const e of entries) {
      const cls = e.action === 'EMERGENCY_OVERRIDE' ? 'emgrow'
                : (e.action === 'VERIFY_FAIL' ? 'failrow' : '');
      tb.appendChild(el('tr', { class: cls },
        el('td', {}, String(e.id)),
        el('td', {}, fmt(e.ts)),
        el('td', {}, `${e.actor_role || '—'}${e.actor_id ? ' #' + e.actor_id : ''}`),
        el('td', {}, el('strong', { style: { color: 'var(--text)' } }, e.action)),
        el('td', {}, e.details || '—'),
        el('td', { class: 'hash' }, (e.token_id || '—').slice(0, 14)),
        el('td', { class: 'hash' }, e.hash.slice(0, 12) + '…'),
        el('td', { class: 'hash' }, e.prev_hash.slice(0, 12) + '…')
      ));
    }
    tbl.appendChild(tb);
    wrap.appendChild(tbl);
    listBox.appendChild(wrap);
  } catch (e) {
    clear(listBox);
    if (e.status !== 401) listBox.appendChild(el('div', { class: 'empty-state' }, 'Error: ' + e.message));
  }
}

async function refreshAlerts(card) {
  const listBox = card.querySelector('#alertsList');
  if (!listBox) return;
  clear(listBox);
  listBox.appendChild(el('div', { class: 'muted', style: { padding: '16px 0' } }, 'Loading…'));
  try {
    const { alerts } = await api('/admin/alerts');
    clear(listBox);
    if (!alerts.length) {
      listBox.appendChild(el('div', { class: 'empty-state' },
        el('span', { class: 'icon' }, '🕊'),
        'No security alerts. All quiet.'
      ));
      return;
    }
    const ul = el('ul', { class: 'alerts' });
    for (const a of alerts) {
      ul.appendChild(el('li', { class: 'sev-' + (a.severity || 'high') },
        el('div', { class: 'alert-time' }, fmt(a.ts) + ' · ' + (a.severity || 'high').toUpperCase()),
        el('div', {}, a.message)
      ));
    }
    listBox.appendChild(ul);
  } catch (e) {
    clear(listBox);
    if (e.status !== 401) listBox.appendChild(el('div', { class: 'empty-state' }, 'Error: ' + e.message));
  }
}

/* ============================================================
   ROUTER + BOOT
   ============================================================ */
async function route() {
  stopCamera();
  if (chainAuto) { clearInterval(chainAuto); chainAuto = null; }

  if (!state.token || !state.user) {
    $('#topbar').classList.add('hidden');
    return viewLogin();
  }
  renderTopbar();
  if (state.user.role === 'resident') return viewResident();
  if (state.user.role === 'guard')    return viewGuard();
  if (state.user.role === 'admin')    return viewAdmin();
  viewLogin();
}

async function boot() {
  if (state.token && state.user && state.user.role) {
    try {
      if (state.user.role === 'admin')         await api('/admin/stats');
      else if (state.user.role === 'guard')    await api('/inside');
      else if (state.user.role === 'resident') await api('/visitors');
    } catch (e) {
      if (e.status !== 401) setSession(null, null);
    }
  }
  renderTopbar();
  route();
}

$('#logoutBtn').addEventListener('click', async () => {
  try { await api('/logout', { method: 'POST' }); } catch (e) {}
  setSession(null, null);
  route();
});

window.addEventListener('beforeunload', stopCamera);

boot();