// Hosti @Home engine. Pure functions, no DOM, no storage. Money is integer cents everywhere inside.
// Doctrine (D-004, D-005): code does the math. Every total, interval and estimate here is computed from the
// household's own receipts. Nothing here says what to eat or where to shop.
//
// reconcile() follows functions/src/receipts/reconcile.ts in this repo (same tolerance rule), but works in cents.
// No code in this file is copied from tallyup.

export const DAY = 86400000;

// ---------- dates (a "day" is a whole number of days since 1970-01-01, local calendar date) ----------
export const dayNum = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / DAY);
export const dayFromDate = (dt) => dayNum(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
export const todayNum = () => dayFromDate(new Date());
export const dayFromISO = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? dayNum(+m[1], +m[2], +m[3]) : null; };
export const isoFromDay = (n) => new Date(n * DAY).toISOString().slice(0, 10);
export const parts = (n) => { const d = new Date(n * DAY); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), dow: d.getUTCDay() }; };
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const fmtDay = (n) => { const p = parts(n); return `${DOW[p.dow]} ${p.d} ${MONTHS[p.m]}`; };
export const fmtShort = (n) => { const p = parts(n); return `${p.d} ${MONTHS[p.m]}`; };

// ---------- money ----------
export const money = (c) => (c < 0 ? '-' : '') + '$' + (Math.abs(c) / 100).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money0 = (c) => (c < 0 ? '-' : '') + '$' + Math.round(Math.abs(c) / 100).toLocaleString('en-NZ');
// Parse what a person types ("12.5", "$1,204.30") into cents. Returns null if it is not a money amount.
export function parseMoney(s) {
  if (s == null) return null;
  const t = String(s).replace(/[$,\s]/g, '');
  if (!/^-?\d+(\.\d{0,2})?$/.test(t)) return null;
  return Math.round(parseFloat(t) * 100);
}
export function parseQty(s) {
  const t = String(s == null ? '' : s).trim();
  if (t === '') return 1;
  if (!/^\d+(\.\d{1,3})?$/.test(t)) return null;
  const v = parseFloat(t);
  return v > 0 ? v : null;
}

// ---------- the receipt checks ----------
// Total check (D-005). Lines must add up to the printed total, within 1 cent per line for rounding.
// A line with a unit price must also equal qty x unit price within 1 cent, or it is flagged as a suspect line.
export function reconcile(lines, printedTotal) {
  const linesTotal = lines.reduce((s, l) => s + l.total, 0);
  const difference = printedTotal - linesTotal;
  const tolerance = Math.max(1, lines.length);
  const suspect = [];
  lines.forEach((l, i) => {
    if (l.unit == null) return;
    const expected = Math.round(l.qty * l.unit);
    if (Math.abs(expected - l.total) > 1) suspect.push(i);
  });
  return { reconciled: Math.abs(difference) <= tolerance && suspect.length === 0, linesTotal, printedTotal, difference, tolerance, suspect };
}

// GST check. NZ GST is 15%, so the GST inside a GST-inclusive total is 3/23 of it. The receipt prints that figure.
// Passes if the printed GST is within 2 cents of 3/23 of the total.
export function checkGst(total, printedGst) {
  if (printedGst == null) return null;
  const expected = Math.round(total * 3 / 23);
  return { ok: Math.abs(expected - printedGst) <= 2, expected, printed: printedGst };
}

// Item count check. Many receipts print "N SUBTOTAL" where N is the number of items counting quantity.
export function checkItemCount(lines, printedCount) {
  if (printedCount == null) return null;
  const counted = lines.reduce((s, l) => s + (Number.isInteger(l.qty) ? l.qty : 1), 0);
  return { ok: counted === printedCount, counted, printed: printedCount };
}

// ---------- receipt barcode ----------
// Seen on one receipt so far: 20 digits = prefix(3) + store(4) + till(3) + transaction(4) + date ddmmyy(6).
// It identifies the transaction. It holds no items and no total. Treated as a hint until more receipts confirm the layout.
export function parseBarcode(code) {
  const s = String(code || '').replace(/\s/g, '');
  if (!/^\d{20}$/.test(s)) return null;
  const dd = +s.slice(14, 16), mm = +s.slice(16, 18), yy = +s.slice(18, 20);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return { raw: s, prefix: s.slice(0, 3), store: s.slice(3, 7), till: s.slice(7, 10), txn: s.slice(10, 14), day: null };
  return { raw: s, prefix: s.slice(0, 3), store: s.slice(3, 7), till: s.slice(7, 10), txn: s.slice(10, 14), day: dayNum(2000 + yy, mm, dd) };
}

// Duplicate key: the barcode when there is one, otherwise store + day + total.
export const dupKey = (r) => r.barcode ? 'b:' + r.barcode : `s:${(r.store || '').toLowerCase()}|${r.day}|${r.total}`;
export function findDuplicate(receipts, cand) {
  const k = dupKey(cand);
  const hit = receipts.find((r) => r.id !== cand.id && dupKey(r) === k);
  if (hit) return hit;
  // A barcode match is exact. Without a barcode on one side, still flag the same store, day and total.
  return receipts.find((r) => r.id !== cand.id && r.day === cand.day && r.total === cand.total && (r.store || '').toLowerCase() === (cand.store || '').toLowerCase()) || null;
}

// ---------- item identity ----------
const SIZE_TOKEN = /^\d+(\.\d+)?(g|kg|ml|l|pk|x|ea)?$/;
export const tokens = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((t) => t.length > 1);
export const itemKey = (name) => tokens(name).filter((t) => !SIZE_TOKEN.test(t)).join(' ') || tokens(name).join(' ');

// Suggest an existing household item for a typed name. Suggest only; the household confirms.
export function suggestItem(text, known) {
  const t = tokens(text).filter((x) => !SIZE_TOKEN.test(x));
  if (!t.length) return null;
  let best = null, bs = 0;
  for (const it of known) {
    const bag = new Set(tokens(it.name).filter((x) => !SIZE_TOKEN.test(x)));
    if (!bag.size) continue;
    let hit = 0;
    for (const x of t) {
      if (bag.has(x)) hit += 1;
      else if ([...bag].some((b) => b.length > 3 && x.length > 3 && (b.startsWith(x) || x.startsWith(b)))) hit += 0.6;
    }
    const cover = hit / t.length, back = hit / bag.size;
    const score = cover * 0.7 + back * 0.3;
    if ((cover >= 0.6 || back === 1) && score > bs) { bs = score; best = it; }
  }
  return best;
}

export const CATS = ['Fruit & veg', 'Dairy & eggs', 'Meat & fish', 'Bakery', 'Pantry', 'Frozen', 'Drinks', 'Household', 'Snacks & treats', 'Other'];
const CAT_WORDS = {
  'Fruit & veg': 'banana apple apples orange mandarin mandarins pear pears lemon lime avocado berries berry grape grapes kiwifruit melon pumpkin garlic potato potatoes kumara carrot carrots onion onions tomato tomatoes cabbage broccoli cauliflower lettuce salad cucumber capsicum celery mushroom mushrooms spinach silverbeet corn beans peas zucchini ginger veg fruit',
  'Dairy & eggs': 'milk cheese butter yoghurt yogurt cream egg eggs',
  'Meat & fish': 'pork beef lamb chicken mince sausage sausages bacon ham steak chops fish salmon tuna snapper prawns roast leg thigh thighs',
  Bakery: 'bread loaf wraps wrap bun buns roll rolls bagel muffin croissant pita',
  Pantry: 'rice pasta flour sugar oil coffee tea cereal oats muesli sauce tinned tomatoes beans honey jam spread peanut vegemite stock salt pepper spice noodles crackers',
  Frozen: 'frozen ice pizza',
  Drinks: 'juice water sparkling cordial wine beer cider soda',
  Household: 'toilet paper towels towel dishwasher dish laundry soap shampoo toothpaste detergent cleaner bags wipes tissues nappies',
  'Snacks & treats': 'chocolate chips biscuits biscuit lollies chippies snack bar candy',
};
export function guessCategory(name) {
  const t = new Set(tokens(name));
  let best = 'Other', n = 0;
  for (const c in CAT_WORDS) {
    const hit = CAT_WORDS[c].split(' ').filter((w) => t.has(w)).length;
    if (hit > n) { n = hit; best = c; }
  }
  return best;
}

// ---------- purchase facts and the usual list ----------
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export { median };

// Receipts that have line detail. Totals-only receipts count towards spend but not towards item facts.
export const withLines = (receipts) => receipts.filter((r) => r.lines && r.lines.length);

// Per-item statistics. An item is "usual" with at least 3 purchase days and a steady gap (mad / median <= 0.5).
export function usualItems(receipts, asOf) {
  const ev = {};
  for (const r of withLines(receipts)) {
    if (asOf != null && r.day > asOf) continue;
    for (const l of r.lines) {
      if (!l.item) continue;
      (ev[l.item] = ev[l.item] || []).push({ day: r.day, total: l.total, unit: l.unit, qty: l.qty, name: l.name, cat: l.cat });
    }
  }
  const out = {};
  for (const id in ev) {
    const e = ev[id].sort((a, b) => a.day - b.day);
    const days = [...new Set(e.map((x) => x.day))];
    if (days.length < 3) continue;
    const gaps = []; for (let i = 1; i < days.length; i++) gaps.push(days[i] - days[i - 1]);
    const med = median(gaps), mad = median(gaps.map((g) => Math.abs(g - med)));
    if (med <= 0 || mad / med > 0.5) continue;
    const last = e[e.length - 1];
    out[id] = { id, name: last.name, cat: last.cat, interval: Math.max(1, Math.round(med)), lastDay: last.day, lastPaid: last.total, count: days.length };
  }
  return out;
}

// Due now: usual items whose gap since last purchase has reached their usual gap (less `lead` days).
// Items not bought for more than twice their usual gap plus a week have lapsed and drop off the list.
export function dueList(receipts, evalDay, opts = {}) {
  const lead = opts.lead || 0, asOf = opts.asOf == null ? evalDay : opts.asOf;
  const st = usualItems(receipts, asOf), due = [];
  for (const id in st) {
    const x = st[id], since = evalDay - x.lastDay;
    if (since >= x.interval - lead && since <= 2 * x.interval + 7) due.push({ ...x, since, over: since - x.interval });
  }
  due.sort((a, b) => b.over - a.over || a.name.localeCompare(b.name));
  return due;
}
export const dueTotal = (due) => due.reduce((s, d) => s + d.lastPaid, 0);

// Latest unit price against the last differing price, within the last 60 days.
export function priceMoves(receipts, today, windowDays = 60) {
  const ev = {};
  for (const r of withLines(receipts)) for (const l of r.lines) if (l.item && l.unit != null) (ev[l.item] = ev[l.item] || []).push({ day: r.day, unit: l.unit, name: l.name });
  const out = [];
  for (const id in ev) {
    const e = ev[id].sort((a, b) => a.day - b.day), now = e[e.length - 1];
    let prev = null;
    for (let i = e.length - 2; i >= 0; i--) if (e[i].unit !== now.unit) { prev = e[i]; break; }
    if (prev && today - now.day <= windowDays) out.push({ id, name: now.name, from: prev.unit, to: now.unit, diff: now.unit - prev.unit, day: now.day });
  }
  return out.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}

// ---------- month, pace, budget ----------
export function monthSpend(receipts, today) {
  const t = parts(today);
  return receipts.filter((r) => { const p = parts(r.day); return p.y === t.y && p.m === t.m && r.day <= today; }).reduce((s, r) => s + r.total, 0);
}
// Pace = spent so far + the average daily spend over the last 28 days (or the days of history if shorter) x days left.
export function monthPace(receipts, today, budget) {
  const t = parts(today), days = daysInMonth(t.y, t.m);
  const spent = monthSpend(receipts, today);
  const first = receipts.length ? Math.min(...receipts.map((r) => r.day)) : today;
  const span = Math.max(1, Math.min(28, today - first + 1));
  const recent = receipts.filter((r) => r.day > today - span && r.day <= today).reduce((s, r) => s + r.total, 0);
  const history = receipts.length >= 2 && span >= 7;
  const projected = history ? spent + Math.round(recent / span * (days - t.d)) : spent;
  const budgetPace = budget ? Math.round(budget * t.d / days) : null; // where a steady spend would be today
  return { spent, day: t.d, days, projected, history, budget: budget || null, budgetPace, ahead: budgetPace == null ? null : spent - budgetPace, left: budget ? budget - spent : null };
}
export function monthlyTotals(receipts, today, n = 6) {
  const t = parts(today), out = [];
  for (let i = n - 1; i >= 0; i--) {
    let m = t.m - i, y = t.y; while (m < 0) { m += 12; y--; }
    const total = receipts.filter((r) => { const p = parts(r.day); return p.y === y && p.m === m && r.day <= today; }).reduce((s, r) => s + r.total, 0);
    out.push({ y, m, label: MONTHS[m], total, current: i === 0 });
  }
  return out;
}
export function storeSplit(receipts, today, windowDays = 90) {
  const by = {};
  for (const r of receipts) if (r.day > today - windowDays && r.day <= today) { const k = r.store || 'Other'; by[k] = (by[k] || 0) + r.total; }
  const total = Object.values(by).reduce((a, b) => a + b, 0);
  return Object.entries(by).map(([store, cents]) => ({ store, cents, share: total ? cents / total : 0 })).sort((a, b) => b.cents - a.cents);
}
// Category split needs lines. Receipts without lines are reported separately so the figure is never presented as complete.
export function categorySplit(receipts, today, windowDays = 30) {
  const by = {}; let covered = 0, all = 0;
  for (const r of receipts) {
    if (!(r.day > today - windowDays && r.day <= today)) continue;
    all += r.total;
    if (r.lines && r.lines.length) { covered += r.total; for (const l of r.lines) by[l.cat || 'Other'] = (by[l.cat || 'Other'] || 0) + l.total; }
  }
  const rows = Object.entries(by).map(([cat, cents]) => ({ cat, cents })).sort((a, b) => b.cents - a.cents);
  return { rows, covered, all };
}

// ---------- totals mode: value without line items ----------
export function rhythm(receipts, today) {
  const win = 28;
  const recent = receipts.filter((r) => r.day > today - win && r.day <= today).sort((a, b) => a.day - b.day);
  const shopDays = [...new Set(recent.map((r) => r.day))];
  const spent = recent.reduce((s, r) => s + r.total, 0);
  const lastTwelve = receipts.filter((r) => r.day <= today).sort((a, b) => a.day - b.day).slice(-12);
  const gaps = []; const ld = [...new Set(lastTwelve.map((r) => r.day))];
  for (let i = 1; i < ld.length; i++) gaps.push(ld[i] - ld[i - 1]);
  return {
    shops: recent.length, perWeek: recent.length / (win / 7), avgShop: recent.length ? Math.round(spent / recent.length) : 0,
    biggest: recent.length ? Math.max(...recent.map((r) => r.total)) : 0, gapDays: gaps.length >= 2 ? Math.round(median(gaps)) : null, shopDays
  };
}
// Next shop, from totals only: the typical gap after the last shop, and the typical size of the last six shops.
export function nextShop(receipts, today) {
  const all = receipts.filter((r) => r.day <= today).sort((a, b) => a.day - b.day);
  if (all.length < 4) return null;
  const rh = rhythm(receipts, today);
  if (rh.gapDays == null) return null;
  const last = all[all.length - 1];
  const sizes = all.slice(-6).map((r) => r.total);
  return { expectedDay: last.day + rh.gapDays, typical: Math.round(median(sizes)), low: Math.min(...sizes), high: Math.max(...sizes), lastDay: last.day, n: sizes.length };
}

// ---------- feedback on a shop: figures only (D-004) ----------
// The shop against the usual list on the day: usual items due (with 2 days of lead), from receipts before that shop.
export function shopFeedback(receipts, r) {
  const prior = receipts.filter((x) => x.day < r.day);
  const due = dueList(prior, r.day, { lead: 2, asOf: r.day - 1 });
  if (!due.length || !(r.lines && r.lines.length)) return null;
  const dueIds = new Set(due.map((d) => d.id));
  const bought = new Set(r.lines.map((l) => l.item));
  const outside = r.lines.filter((l) => !dueIds.has(l.item));
  const missed = due.filter((d) => !bought.has(d.id));
  return {
    day: r.day, store: r.store, total: r.total, listTotal: dueTotal(due), dueCount: due.length,
    outsideTotal: outside.reduce((s, l) => s + l.total, 0), outside, missed, missedTotal: dueTotal(missed)
  };
}
export function lastFullShop(receipts) {
  const full = withLines(receipts).filter((r) => r.lines.length >= 5).sort((a, b) => a.day - b.day);
  return full[full.length - 1] || null;
}

// ---------- what depth the data supports ----------
// 0 = no shops yet, 1 = totals only, 2 = some line detail, 3 = enough line detail for the usual list.
export function dataLevel(receipts, today) {
  if (!receipts.length) return 0;
  const lined = withLines(receipts);
  if (!lined.length) return 1;
  return Object.keys(usualItems(receipts, today)).length ? 3 : 2;
}

// ---------- coupons ----------
export const couponState = (c, today) => c.used ? 'used' : (c.expires != null && c.expires < today) ? 'expired' : (c.expires != null && c.expires - today <= 3) ? 'soon' : 'active';
