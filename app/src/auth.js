// Founder-demo auth adapter (D-007). Session stays on this device until sign out.
// Packaged product: swap for Firebase Auth with persistence LOCAL. Do not log emails or passwords.

const SESSION_KEY = 'hosti-home.session.v1';
const ACCOUNTS_KEY = 'hosti-home.accounts.v1';
const ADOPT_KEY = 'hosti-home.legacy-adopted';
const ITERATIONS = 100000;

function memoryStore() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

const ls = typeof localStorage === 'undefined' ? memoryStore() : localStorage;

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const un64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function normEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export async function idsFromEmail(email) {
  const n = normEmail(email);
  if (!n || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(n)) return null;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('hosti-home:' + n));
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return { uid: 'u_' + hex.slice(0, 20), householdId: 'h_' + hex.slice(20, 40), email: n };
}

async function derive(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, key, 256);
  return new Uint8Array(bits);
}

function accounts() {
  try { return JSON.parse(ls.getItem(ACCOUNTS_KEY) || '{}') || {}; } catch { return {}; }
}
function saveAccounts(a) { ls.setItem(ACCOUNTS_KEY, JSON.stringify(a)); }

let session = null;

export function restoreSession() {
  try { session = JSON.parse(ls.getItem(SESSION_KEY) || 'null'); } catch { session = null; }
  if (!session || !session.uid || !session.email) session = null;
  return session;
}

export function currentSession() { return session; }

function persist(s) {
  session = s;
  if (s) ls.setItem(SESSION_KEY, JSON.stringify(s));
  else ls.removeItem(SESSION_KEY);
  return session;
}

export async function createAccount({ email, password, displayName }) {
  const ids = await idsFromEmail(email);
  if (!ids) return { ok: false, error: 'Enter a valid email.' };
  if (!password || String(password).length < 8) return { ok: false, error: 'Use 8 or more characters for the password.' };
  const all = accounts();
  if (all[ids.uid]) return { ok: false, error: 'That email already has an account on this device. Sign in.' };
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt);
  all[ids.uid] = {
    uid: ids.uid,
    householdId: ids.householdId,
    email: ids.email,
    displayName: String(displayName || '').trim(),
    salt: b64(salt),
    passHash: b64(hash),
    createdAt: new Date().toISOString(),
    adapter: 'local-demo',
  };
  saveAccounts(all);
  return { ok: true, session: persist({ uid: ids.uid, householdId: ids.householdId, email: ids.email, displayName: all[ids.uid].displayName, persistence: 'local', signedInAt: Date.now() }) };
}

export async function signIn({ email, password }) {
  const ids = await idsFromEmail(email);
  if (!ids) return { ok: false, error: 'Enter a valid email.' };
  const rec = accounts()[ids.uid];
  if (!rec) return { ok: false, error: 'No account for that email on this device.' };
  const hash = await derive(password, un64(rec.salt));
  if (b64(hash) !== rec.passHash) return { ok: false, error: 'Email or password is wrong.' };
  return { ok: true, session: persist({ uid: rec.uid, householdId: rec.householdId, email: rec.email, displayName: rec.displayName || '', persistence: 'local', signedInAt: Date.now() }) };
}

export function signOut() {
  persist(null);
}

export function legacyAdoptedBy() {
  return ls.getItem(ADOPT_KEY);
}

export function markLegacyAdopted(uid) {
  if (!ls.getItem(ADOPT_KEY)) ls.setItem(ADOPT_KEY, uid);
}

restoreSession();
