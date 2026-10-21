// Cloud adapter for the founder demo. Every call is a stub until Architecture marks it LIVE.
// Packaged product replaces this file with Firebase Auth / Firestore / Storage / Functions.

export const LIVE = false;
export const BACKEND = 'none';

export function notLive(feature) {
  return { ok: false, live: false, feature, message: 'Not in this version.' };
}

export async function syncHousehold() { return notLive('firestore-sync'); }
export async function pullHousehold() { return notLive('firestore-pull'); }
export async function readReceiptImage() { return notLive('receipt-read'); }
export async function pantryCheck() { return notLive('pantry-check'); }
export async function bankTotals() { return notLive('bank-feed'); }
export async function subscribeHome() { return notLive('billing'); }
export async function subscribePlus() { return notLive('billing'); }
export async function sendFortnightReport() { return notLive('reports'); }
