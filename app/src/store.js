// Local storage for the founder demo. Vault is per signed-in uid on this device (D-007, docs/DATA.md).
// Packaged product: Firestore households/{householdId}/... via app/src/services/firestore.ts.
import { todayNum, renameItem as renameInReceipts, itemKey } from './engine.js';
import { legacyAdoptedBy, markLegacyAdopted } from './auth.js';

const LEGACY_KEY = 'hosti-home.v1';
const blank = () => ({
  v: 1, onboarded: false, budget: 0, receipts: [], coupons: [], entry: [], created: todayNum(), weekStart: 1, celebrated: 0, itemPrefs: {}, ticks: {},
});
let state = blank();
let vaultUid = null;
const subs = new Set();

export const stateKey = (id) => `hosti-home.v1.${id}`;
export const photoDbName = (id) => `hosti-home-photos.${id}`;

export function load(nextUid) {
  vaultUid = nextUid || null;
  if (!vaultUid) { state = blank(); return state; }
  try {
    const raw = localStorage.getItem(stateKey(vaultUid));
    if (raw) state = { ...blank(), ...JSON.parse(raw) };
    else {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy && !legacyAdoptedBy()) {
        state = { ...blank(), ...JSON.parse(legacy) };
        markLegacyAdopted(vaultUid);
        save();
      } else state = blank();
    }
  } catch { state = blank(); }
  return state;
}
export const get = () => state;
export function save() {
  if (!vaultUid) return;
  try { localStorage.setItem(stateKey(vaultUid), JSON.stringify(state)); } catch (e) { console.warn('save failed', e && e.name); }
  subs.forEach((f) => f(state));
}
export const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };
export const uid = (p = 'r') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function addReceipt(r) { state.receipts.push(r); state.receipts.sort((a, b) => a.day - b.day); save(); }
export function updateReceipt(r) { const i = state.receipts.findIndex((x) => x.id === r.id); if (i >= 0) state.receipts[i] = r; else state.receipts.push(r); state.receipts.sort((a, b) => a.day - b.day); save(); }
export function renameItem(fromKey, newName) {
  const n = renameInReceipts(state.receipts, fromKey, newName);
  const to = itemKey(newName);
  if (state.itemPrefs[fromKey]) {
    if (to && to !== fromKey) {
      state.itemPrefs[to] = { ...state.itemPrefs[fromKey], ...(state.itemPrefs[to] || {}) };
      delete state.itemPrefs[fromKey];
    }
  }
  save(); return n;
}
export function setItemPref(key, pref) { if (pref) state.itemPrefs[key] = pref; else delete state.itemPrefs[key]; save(); }
function photoIdsOf(r) {
  if (!r) return [];
  if (Array.isArray(r.photoIds) && r.photoIds.length) return r.photoIds;
  return r.photoId ? [r.photoId] : [];
}
export function removeReceipt(id) {
  const r = state.receipts.find((x) => x.id === id);
  photoIdsOf(r).forEach(deletePhoto);
  state.receipts = state.receipts.filter((x) => x.id !== id); save();
}
export function addCoupon(c) { state.coupons.push(c); save(); }
export function removeCoupon(id) {
  const c = state.coupons.find((x) => x.id === id);
  if (c && c.photoId) deletePhoto(c.photoId);
  state.coupons = state.coupons.filter((x) => x.id !== id); save();
}
export function logEntrySeconds(sec) { state.entry.push(Math.round(sec)); state.entry = state.entry.slice(-50); }
export function removeSample() { state.receipts = state.receipts.filter((r) => !r.sample); save(); }
export const hasSample = () => state.receipts.some((r) => r.sample);

function db() {
  return new Promise((res, rej) => {
    const q = indexedDB.open(photoDbName(vaultUid || 'anon'), 1);
    q.onupgradeneeded = () => q.result.createObjectStore('photos');
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}
export async function putPhoto(id, blob) { const d = await db(); return new Promise((res, rej) => { const t = d.transaction('photos', 'readwrite'); t.objectStore('photos').put(blob, id); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
export async function getPhoto(id) { const d = await db(); return new Promise((res, rej) => { const q = d.transaction('photos').objectStore('photos').get(id); q.onsuccess = () => res(q.result || null); q.onerror = () => rej(q.error); }); }
export async function deletePhoto(id) { try { const d = await db(); d.transaction('photos', 'readwrite').objectStore('photos').delete(id); } catch { /* ignore */ } }
export async function allPhotos() { const d = await db(); return new Promise((res, rej) => { const out = {}; const q = d.transaction('photos').objectStore('photos').openCursor(); q.onsuccess = () => { const c = q.result; if (c) { out[c.key] = c.value; c.continue(); } else res(out); }; q.onerror = () => rej(q.error); }); }
async function clearPhotos() { const d = await db(); return new Promise((res) => { const t = d.transaction('photos', 'readwrite'); t.objectStore('photos').clear(); t.oncomplete = res; }); }

export async function shrink(file, max = 1600) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b), 'image/jpeg', 0.82));
}
const blobToData = (b) => new Promise((res) => { const f = new FileReader(); f.onload = () => res(f.result); f.readAsDataURL(b); });
const dataToBlob = async (d) => (await fetch(d)).blob();

export async function exportAll() {
  const photos = {}; const all = await allPhotos().catch(() => ({}));
  for (const k in all) photos[k] = await blobToData(all[k]);
  return JSON.stringify({ app: 'hosti-home', exported: new Date().toISOString(), uid: vaultUid, householdId: state.householdId || null, state, photos });
}
export async function importAll(text) {
  const o = JSON.parse(text);
  if (!o || o.app !== 'hosti-home' || !o.state || !Array.isArray(o.state.receipts)) throw new Error('This file is not a Hosti @Home backup.');
  state = { ...blank(), ...o.state }; save();
  await clearPhotos();
  for (const k in (o.photos || {})) await putPhoto(k, await dataToBlob(o.photos[k]));
}
export async function eraseAll() {
  state = blank();
  try { if (vaultUid) localStorage.removeItem(stateKey(vaultUid)); } catch { /* ignore */ }
  await clearPhotos().catch(() => {});
  save();
}
