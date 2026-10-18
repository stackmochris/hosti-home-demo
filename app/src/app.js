// Hosti @Home web app. Local-first: all data stays on this device.
// The week is the main unit. Detail sits behind "Tell me more". Figures only, no verdict words (D-004).
import * as E from './engine.js';
import * as S from './store.js';
import { sampleReceipts } from './sample.js';
import { readReceiptBarcode } from './barcode.js';

const $app = document.getElementById('app');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
let route = 'spend';
const TABS = ['spend', 'due', 'add', 'wallet', 'more'];
const EMOJI = { 'Fruit & veg': '🥦', 'Dairy & eggs': '🥛', 'Meat & fish': '🥩', Bakery: '🍞', Pantry: '🥫', Frozen: '🧊', Drinks: '🧃', Household: '🧻', 'Snacks & treats': '🍫', Discounts: '🏷️', Other: '🛒' };
const ICON = {
  spend: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" stroke-linecap="round"/>',
  due: '<path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" stroke-linecap="round" stroke-linejoin="round"/>',
  add: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8" stroke-linecap="round"/>',
  wallet: '<path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8z" stroke-linejoin="round"/><path d="M14 6v12" stroke-dasharray="2 3"/>',
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
};
const LABEL = { spend: 'Spend', due: 'Due now', add: 'Add', wallet: 'Wallet', more: 'More' };
const DAYS = [['1', 'Monday'], ['2', 'Tuesday'], ['3', 'Wednesday'], ['4', 'Thursday'], ['5', 'Friday'], ['6', 'Saturday'], ['0', 'Sunday']];

// ---------- tiny DOM helpers ----------
function h(tag, attrs, ...kids) {
  const el = tag === 'svg' || (attrs && attrs.ns) ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
  for (const k in attrs || {}) {
    const v = attrs[k];
    if (k.startsWith('aria-') && v != null) { el.setAttribute(k, String(v)); continue; }
    if (v == null || v === false || k === 'ns') continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
}
const A = (el, ...k) => el.append(...k.flat().filter((x) => x != null && x !== false));
const svg = (inner, attrs = {}) => h('svg', { ns: 1, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, html: inner, ...attrs });
function toast(msg) { const t = h('div', { class: 'toast', role: 'status' }, msg); document.body.append(t); setTimeout(() => t.remove(), 2600); }
function countTo(el, cents, fmt = E.money) {
  if (reduce || cents === 0) { el.textContent = fmt(cents); return; }
  const t0 = performance.now(), dur = 700;
  const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(Math.round(cents * e)); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
const today = () => E.todayNum();
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
const signed = (c) => (c > 0 ? '+' : c < 0 ? '-' : '') + E.money(Math.abs(c));
const range = (a, b) => `${E.fmtShort(a)} to ${E.fmtShort(b)}`;

// A short burst of confetti. Wordless. Skipped entirely when the device asks for reduced motion.
function confetti() {
  if (reduce) return;
  const c = h('canvas', { class: 'confetti', 'aria-hidden': 'true' }); document.body.append(c);
  const dpr = devicePixelRatio || 1; c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  const g = c.getContext('2d'); g.scale(dpr, dpr);
  const cols = ['#2f9e5d', '#7fe3a8', '#c47b2b', '#d45b44', '#0f3d2e', '#f2c14e'];
  const ps = Array.from({ length: 80 }, () => ({ x: innerWidth / 2 + (Math.random() - 0.5) * 90, y: innerHeight * 0.3, vx: (Math.random() - 0.5) * 10, vy: -Math.random() * 10 - 3, w: 5 + Math.random() * 6, hh: 3 + Math.random() * 4, col: cols[Math.floor(Math.random() * cols.length)], rot: Math.random() * 6 }));
  let t0; const step = (t) => {
    t0 = t0 || t; const k = (t - t0) / 1900; g.clearRect(0, 0, innerWidth, innerHeight);
    ps.forEach((p) => { p.vy += 0.28; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.rot += 0.15; g.save(); g.globalAlpha = Math.max(0, 1 - k * k); g.translate(p.x, p.y); g.rotate(p.rot); g.fillStyle = p.col; g.fillRect(-p.w / 2, -p.hh / 2, p.w, p.hh); g.restore(); });
    if (k < 1) requestAnimationFrame(step); else c.remove();
  };
  requestAnimationFrame(step);
}

// ---------- shell ----------
let keepDraft = false;
function render() {
  const st = S.get();
  document.querySelectorAll('.sheet').forEach((s) => s.remove());
  $app.replaceChildren();
  document.querySelector('nav')?.remove();
  if (!st.onboarded) { $app.append(onboarding()); return; }
  const screens = { spend: spendScreen, due: dueScreen, add: addScreen, wallet: walletScreen, more: moreScreen };
  $app.append(screens[route]());
  const dueN = dueFor(st, today()).filter((d) => d.over >= 0).length;
  const soonN = st.coupons.filter((c) => E.couponState(c, today()) === 'soon').length;
  document.body.append(h('nav', { 'aria-label': 'Main' }, h('div', { class: 'in' }, TABS.map((t) =>
    h('a', { href: '#' + t, 'aria-current': t === route ? 'page' : null },
      svg(ICON[t]), LABEL[t],
      t === 'due' && dueN ? h('span', { class: 'badge' }, dueN) : null,
      t === 'wallet' && soonN ? h('span', { class: 'badge' }, soonN) : null)))));
}
function rerender() { const y = scrollY; render(); scrollTo(0, y); }
function go() {
  const r = (location.hash || '#spend').slice(1); route = TABS.includes(r) ? r : 'spend';
  if (!keepDraft) addDraft = null; keepDraft = false;
  render(); scrollTo(0, 0);
}
addEventListener('hashchange', go);

function sheet(title, build) {
  const close = () => s.remove();
  const s = h('div', { class: 'sheet', role: 'dialog', 'aria-label': title },
    h('div', { class: 'in' }, h('div', { class: 'head' }, h('h1', null, title), h('button', { class: 'ghost', onclick: close }, 'Close')), build(close)));
  document.body.append(s); s.scrollTop = 0; return s;
}

// ---------- data helpers ----------
const lastLines = (rs) => {
  const m = new Map();
  for (const r of E.withLines(rs)) for (const l of r.lines) {
    if (!l.item || l.total <= 0) continue;
    const e = m.get(l.item) || { item: l.item, count: 0, day: -1 };
    e.count++; if (r.day >= e.day) Object.assign(e, { name: l.name, cat: l.cat, qty: l.qty, total: l.total, day: r.day });
    m.set(l.item, e);
  }
  return [...m.values()];
};
const knownItems = (rs) => lastLines(rs).map(({ item, name, cat }) => ({ item, name, cat }));
const shopsWithLines = (rs) => E.withLines(rs).length;
// Due list with the household's own snoozes and stopped items applied.
function dueFor(st, t) {
  const prefs = st.itemPrefs || {};
  return E.dueList(st.receipts, t).filter((d) => { const p = prefs[d.id]; return !(p && (p.stopped || (p.snoozeUntil && p.snoozeUntil > t))); });
}
const fmtDec = (c) => (c / 100).toFixed(2);

// ---------- onboarding ----------
function onboarding() {
  const budget = h('input', { id: 'bud', inputmode: 'decimal', placeholder: 'e.g. 850' });
  const finish = (sample) => {
    const st = S.get(); st.onboarded = true;
    const b = E.parseMoney(budget.value); st.budget = b && b > 0 ? b : 0;
    if (sample) st.receipts.push(...sampleReceipts(today()));
    S.save(); location.hash = sample ? '#spend' : '#add'; go();
  };
  return h('div', { class: 'rise' },
    h('div', { class: 'head' }, h('h1', null, 'Hosti @Home')),
    h('p', { class: 'meta' }, 'Your groceries, as numbers. What you spent this week, what you usually buy, and when it runs low.'),
    h('div', { class: 'card' },
      h('h3', null, 'Private by default'),
      h('p', { class: 'meta', style: 'margin-top:6px' }, 'Everything you add stays on this device. There is no account and nothing is sent anywhere. Back it up from More whenever you like.')),
    h('div', { class: 'card' },
      h('label', { for: 'bud', style: 'margin-top:0' }, 'Monthly grocery budget (optional)'), budget,
      h('p', { class: 'meta small', style: 'margin-top:6px' }, 'We turn it into a weekly figure. You can change it later in More.')),
    h('div', { class: 'actions' },
      h('button', { class: 'fill', onclick: () => finish(false) }, 'Start with my own shops'),
      h('button', { onclick: () => finish(true) }, 'Look around with sample data')),
    h('p', { class: 'meta small', style: 'margin-top:12px' }, 'Sample data is invented and can be removed in one tap.'));
}

// ---------- shared pieces ----------
function emptyArt() {
  return h('svg', { ns: 1, viewBox: '0 0 120 96', fill: 'none', 'aria-hidden': 'true', html:
    '<rect x="22" y="30" width="76" height="52" rx="10" fill="var(--surface)" stroke="var(--hair)" stroke-width="2"/><path d="M38 30l4-14h36l4 14" stroke="var(--meta)" stroke-width="2" stroke-linejoin="round"/><circle cx="46" cy="82" r="5" fill="var(--ink)"/><circle cx="74" cy="82" r="5" fill="var(--ink)"/><path d="M40 48h40M40 60h26" stroke="var(--hair)" stroke-width="3" stroke-linecap="round"/><circle cx="92" cy="26" r="9" fill="var(--good-fill)"/><path d="M88 26h8M92 22v8" stroke="#fff" stroke-width="2" stroke-linecap="round"/>' });
}
const empty = (title, text, cta) => h('div', { class: 'card empty rise' }, emptyArt(), h('h3', null, title), h('p', null, text), cta);
const toAdd = (label = 'Add a shop') => h('a', { class: 'btn fill', href: '#add' }, label);
const kv = (label, value, sub, cls) => h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 't' }, label), sub ? h('div', { class: 's' }, sub) : null), h('div', { class: 'amt', style: cls ? `color:var(--${cls})` : null }, value));
const chev = () => h('span', { class: 'chev', 'aria-hidden': 'true' }, '›');
function more(id, title, summary, body) {
  return h('details', { class: 'more', id: 'm-' + id }, h('summary', null, h('div', { class: 'grow' }, h('div', { class: 't' }, title), h('div', { class: 's' }, summary)), chev()), h('div', { class: 'body' }, body));
}
function openMore(id) { const el = document.getElementById('m-' + id); if (!el) return; el.open = true; el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); }
const how = (text) => h('p', { class: 'how' }, 'How this is worked out: ' + text);

function ring(spent, budget) {
  const R = 54, C = 2 * Math.PI * R, k = Math.min(1, spent / budget), over = spent > budget;
  const bar = h('circle', { ns: 1, class: 'bar', cx: 66, cy: 66, r: R, fill: 'none', 'stroke-width': 12, 'stroke-linecap': 'round', stroke: over ? 'var(--peach)' : 'var(--mint)', 'stroke-dasharray': C, 'stroke-dashoffset': reduce ? C * (1 - k) : C, transform: 'rotate(-90 66 66)' });
  if (!reduce) requestAnimationFrame(() => requestAnimationFrame(() => bar.setAttribute('stroke-dashoffset', C * (1 - k))));
  return h('svg', { ns: 1, class: 'ring', viewBox: '0 0 132 132', role: 'img', 'aria-label': `${Math.round(spent / budget * 100)} percent of this week's budget spent` },
    h('circle', { ns: 1, class: 'trk', cx: 66, cy: 66, r: R, fill: 'none', 'stroke-width': 12 }), bar,
    h('text', { ns: 1, x: 66, y: 72, 'text-anchor': 'middle', 'font-size': 22 }, Math.round(spent / budget * 100) + '%'));
}
const badgeSvg = () => h('svg', { ns: 1, class: 'badge-svg', viewBox: '0 0 56 56', 'aria-hidden': 'true', html: '<circle cx="28" cy="28" r="23" fill="none" stroke="var(--good-fill)" stroke-width="5"/><path d="M18 29l7 7 13-15" fill="none" stroke="var(--good-fill)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>' });

// ---------- SPEND ----------
function spendScreen() {
  const st = S.get(), rs = st.receipts, t = today(), lvl = E.dataLevel(rs, t);
  const wv = E.weekView(rs, t, st.budget, st.weekStart), pace = E.monthPace(rs, t, st.budget), tp = E.parts(t);
  const wrap = h('div');
  A(wrap, h('div', { class: 'head' }, h('h1', null, 'Spend'), h('span', { class: 'meta' }, range(wv.start, wv.end))));

  // hero: this week
  const big = h('div', { class: 'big' }, E.money(0));
  const left = h('div', null, h('div', { class: 'lab' }, 'This week'), big);
  if (wv.budget) A(left, h('div', { class: 'sub' }, `of ${E.money0(wv.budget)} for the week`));
  A(left, h('div', { class: 'sub' }, `Day ${wv.dayOf} of 7`));
  if (lvl && wv.budget) A(left, h('div', { class: 'pill ' + (wv.left >= 0 ? 'good' : 'attn') }, wv.left >= 0 ? `● ${E.money0(wv.left)} left` : `▲ ${E.money0(-wv.left)} over`));
  else if (lvl && !wv.budget) A(left, h('div', { class: 'sub' }, h('a', { href: '#more', style: 'color:var(--mint)' }, 'Set a monthly budget'), ' to see your week against it'));
  else A(left, h('div', { class: 'pill flat' }, 'Nothing added yet'));
  const hero = h('div', { class: 'hero rise' }, wv.budget && lvl ? h('div', { class: 'hero-grid' }, left, ring(wv.spent, wv.budget)) : left);
  if (lvl) A(hero, h('div', { class: 'foot' },
    h('span', null, E.MONTHS[tp.m] + ' ', h('b', null, E.money0(pace.spent)), st.budget ? ` of ${E.money0(st.budget)}` : ''),
    wv.prev.shops ? h('span', null, 'Last week ', h('b', null, E.money0(wv.prev.spent))) : null));
  A(wrap, hero); countTo(big, wv.spent);

  if (!lvl) {
    A(wrap, empty('Add your first shop', 'Type in a till total and the date. That is enough to start. Add the item lines when you want more.', toAdd()));
    return wrap;
  }

  // last week: figures, plus a wordless moment when the closed week came in within budget
  const pv = wv.prev;
  if (pv.shops) {
    const under = pv.budget != null && pv.spent <= pv.budget;
    A(wrap, h('div', { class: 'card lastweek' + (under ? ' edge-good' : '') },
      under ? badgeSvg() : null,
      h('div', { class: 'grow', style: 'flex:1;min-width:0' }, h('div', { class: 'meta small' }, `Last week · ${range(pv.start, pv.end)}`),
        h('div', { class: 'fig' }, E.money0(pv.spent), pv.budget != null ? h('span', { class: 'meta', style: 'font-weight:500;font-size:14px' }, ` of ${E.money0(pv.budget)}`) : null),
        pv.budget != null ? h('div', { class: 'tag ' + (under ? 'good' : 'amber') }, under ? `▼ ${E.money0(pv.budget - pv.spent)} under your weekly budget` : `▲ ${E.money0(pv.spent - pv.budget)} over your weekly budget`) : null),
      under ? h('button', { class: 'link', 'aria-label': 'Replay the celebration', onclick: confetti }, 'Replay') : null));
    if (E.weekCelebration(wv, st.celebrated)) { st.celebrated = pv.start; S.save(); setTimeout(confetti, 450); }
  }

  // glance: the few lines that matter
  const ns = E.nextShop(rs, t), due = lvl === 3 ? dueFor(st, t) : [], pm = lvl === 3 ? E.priceMoves(rs, t) : [];
  const glance = h('div', { class: 'card flush glance' });
  if (ns) {
    const away = ns.expectedDay - t;
    A(glance, h('div', { class: 'row' }, h('div', { class: 'cat' }, '🛒'), h('div', { class: 'grow' }, h('div', { class: 't' }, 'Next shop'),
      h('div', { class: 's' }, (away > 0 ? `Around ${E.fmtDay(ns.expectedDay)}` : away === 0 ? 'Around today' : 'Your usual gap has passed') + ` · typically ${E.money0(ns.typical)}`))));
  }
  if (lvl === 3) A(glance, h('div', { class: 'row', role: 'link', tabindex: 0, onclick: () => (location.hash = '#due'), onkeydown: (e) => { if (e.key === 'Enter') location.hash = '#due'; } },
    h('div', { class: 'cat' }, '📝'), h('div', { class: 'grow' }, h('div', { class: 't' }, 'Due now'), h('div', { class: 's' }, `${plural(due.length, 'item', 'items')} · ${E.money0(E.dueTotal(due))} at last prices`)), chev()));
  if (pm.length) A(glance, h('div', { class: 'row', role: 'button', tabindex: 0, onclick: () => openMore('prices'), onkeydown: (e) => { if (e.key === 'Enter') openMore('prices'); } },
    h('div', { class: 'cat' }, '🏷️'), h('div', { class: 'grow' }, h('div', { class: 't' }, 'Prices that moved'), h('div', { class: 's' }, `${pm.length} in the last 60 days`)), chev()));
  if (glance.children.length) A(wrap, glance);
  if (lvl < 3) {
    const n = shopsWithLines(rs);
    A(wrap, h('div', { class: 'card' }, h('h3', null, lvl === 1 ? 'Unlock more from the same shops' : 'Your usual list is close'),
      h('p', { class: 'meta', style: 'margin-top:6px' }, 'Add the item lines for 3 or more shops. Then you get what you usually buy, what is due now, how your shop compared with your list, and prices that moved.'),
      h('div', { class: 'progress' }, h('i', { style: `width:${Math.min(1, n / 3) * 100}%` })), h('div', { class: 'meta small' }, `${n} of 3 shops with item lines`)));
  }

  // tell me more
  A(wrap, h('h2', null, 'Tell me more'));
  const mt = E.monthlyTotals(rs, t, 6), mx = Math.max(...mt.map((m) => m.total), 1);
  A(wrap, more('month', 'This month', `${E.money0(pace.spent)}${st.budget ? ' of ' + E.money0(st.budget) : ''} · day ${pace.day} of ${pace.days}`, h('div', null,
    h('div', { class: 'card flush' },
      kv('Spent so far', E.money(pace.spent)), st.budget ? kv('Monthly budget', E.money(st.budget)) : null, st.budget ? kv('Left', E.money(pace.left)) : null,
      pace.history ? kv("At your last 28 days' pace", E.money0(pace.projected), st.budget ? (pace.projected > st.budget ? `${E.money0(pace.projected - st.budget)} over budget` : `${E.money0(st.budget - pace.projected)} under budget`) : 'for the month') : kv('Month projection', 'Soon', 'Starts once you have a week of shops')),
    h('div', { class: 'bars' }, mt.map((m, i) => h('div', { class: 'b' + (m.current ? ' cur' : '') }, h('div', { class: 'v' }, m.total ? E.money0(m.total) : ''),
      h('div', { class: 'col', style: `height:${Math.max(3, m.total / mx * 78)}px;animation-delay:${i * 60}ms` }), h('div', { class: 'l' }, m.label)))),
    how('the projection is spent so far plus your average daily spend over the last 28 days, times the days left in the month. The weekly budget is your monthly budget times 7, divided by the days in the month.'))));

  const rh = E.rhythm(rs, t);
  A(wrap, more('rhythm', 'Your shopping rhythm', `${rh.perWeek.toFixed(1)} shops a week · average ${E.money0(rh.avgShop)}`, h('div', null,
    h('div', { class: 'kpis' }, h('div', { class: 'kpi' }, h('div', { class: 'v' }, rh.perWeek.toFixed(1)), h('div', { class: 'l' }, 'shops a week')),
      h('div', { class: 'kpi' }, h('div', { class: 'v' }, E.money0(rh.avgShop)), h('div', { class: 'l' }, 'average shop')), h('div', { class: 'kpi' }, h('div', { class: 'v' }, E.money0(rh.biggest)), h('div', { class: 'l' }, 'biggest shop'))),
    ns ? h('div', { class: 'card flush' }, kv('Next shop', E.fmtDay(ns.expectedDay), `Your usual gap is ${rh.gapDays} days`), kv('Typical size', E.money(ns.typical), `Last ${ns.n} ranged ${E.money0(ns.low)} to ${E.money0(ns.high)}`)) : null,
    how('shops, average and biggest are counted over the last 28 days. The next shop is your last shop plus the typical gap between your last shops, and its size is the middle of your last six.'))));

  const ss = E.storeSplit(rs, t);
  if (ss.length) A(wrap, more('stores', 'Where you shop', `${ss[0].store} · ${Math.round(ss[0].share * 100)}% of 90 days`, h('div', null,
    h('div', { class: 'split' }, ss.map((s, i) => h('i', { class: 'c' + Math.min(i, 5), style: `width:${s.share * 100}%` }))),
    ss.slice(0, 6).map((s, i) => h('div', { style: 'display:flex;justify-content:space-between;padding:4px 0' }, h('span', null, h('span', { class: 'dot c' + Math.min(i, 5) }), s.store), h('span', { class: 'num' }, E.money0(s.cents) + ' · ' + Math.round(s.share * 100) + '%'))),
    how('each store\'s share of what you spent in the last 90 days.'))));

  if (lvl >= 2) {
    const cs = E.categorySplit(rs, t, 30), pos = cs.rows.filter((r) => r.cents > 0);
    if (pos.length) A(wrap, more('cats', 'What it went on', `${pos[0].cat} · ${E.money0(pos[0].cents)} in 30 days`, h('div', null,
      h('div', { class: 'card flush' }, cs.rows.map((r) => h('div', { class: 'row' }, h('div', { class: 'cat' }, EMOJI[r.cat] || '🛒'),
        h('div', { class: 'grow' }, h('div', { class: 't' }, r.cat), h('div', { class: 'progress', style: 'margin:6px 0 0' }, h('i', { style: `width:${Math.max(0, r.cents) / pos[0].cents * 100}%` }))), h('div', { class: 'amt' }, signed(r.cents).replace(/\.00$/, ''))))),
      cs.covered < cs.all ? h('p', { class: 'meta small' }, `From the ${E.money0(cs.covered)} of ${E.money0(cs.all)} spent that has item lines.`) : null,
      how('your item lines added up by category over the last 30 days.'))));
  }
  if (lvl === 3) {
    const lf = E.lastFullShop(rs), fb = lf && t - lf.day <= 21 ? E.shopFeedback(rs, lf) : null;
    if (fb) {
      const d = fb.total - fb.listTotal;
      A(wrap, more('list', `Your shop on ${E.fmtDay(fb.day)}`, `${signed(d)} against your usual list`, h('div', null,
        h('div', { class: 'card flush' }, kv('This shop', E.money(fb.total)), kv('Your usual list that day', E.money(fb.listTotal), plural(fb.dueCount, 'item', 'items')), kv('Difference', signed(d)),
          fb.outside.length ? h('div', { class: 'row edge-amber' }, h('div', { class: 'grow' }, h('div', { class: 't' }, 'Outside your list'), h('div', { class: 's' }, fb.outside.map((l) => l.name).slice(0, 6).join(', ') + (fb.outside.length > 6 ? ` and ${fb.outside.length - 6} more` : ''))), h('div', { class: 'amt', style: 'color:var(--amber)' }, E.money(fb.outsideTotal))) : null,
          fb.missed.length ? kv('On your list, not bought', E.money(fb.missedTotal), fb.missed.map((m) => m.name).slice(0, 6).join(', ')) : null),
        how('your list is the usual items that were due on that day, from your own history, at the prices you paid last time.'))));
    }
    if (pm.length) A(wrap, more('prices', 'Prices that moved', `${plural(pm.length, 'item', 'items')} in the last 60 days`, h('div', null,
      h('div', { class: 'card flush' }, pm.slice(0, 8).map((m) => h('div', { class: 'row ' + (m.diff > 0 ? 'edge-attn' : 'edge-good') },
        h('div', { class: 'cat' }, EMOJI[(rs.flatMap((r) => r.lines || []).find((l) => l.item === m.id) || {}).cat] || '🛒'),
        h('div', { class: 'grow' }, h('div', { class: 't' }, m.name), h('div', { class: 's num' }, `${E.money(m.from)} to ${E.money(m.to)}`)),
        h('div', { class: 'tag ' + (m.diff > 0 ? 'attn' : 'good') }, (m.diff > 0 ? '▲ +' : '▼ -') + E.money(Math.abs(m.diff)))))),
      how('the latest unit price against the last different price you paid, within 60 days.'))));
  }
  const recent = [...rs].sort((a, b) => b.day - a.day || b.id.localeCompare(a.id));
  A(wrap, more('shops', 'Your shops', `${plural(rs.length, 'shop', 'shops')} · last ${E.fmtDay(recent[0].day)}`, h('div', null,
    h('div', { class: 'card flush' }, recent.slice(0, 6).map(shopRow)), rs.length > 6 ? h('button', { class: 'full', onclick: allShops }, `All ${rs.length} shops`) : null)));
  return wrap;
}

function shopRow(r) {
  return h('div', { class: 'row', role: 'button', tabindex: 0, onclick: () => shopSheet(r.id), onkeydown: (e) => { if (e.key === 'Enter') shopSheet(r.id); } },
    h('div', { class: 'grow' }, h('div', { class: 't' }, r.store || 'Shop', r.sample ? h('span', { class: 'meta small' }, '  sample') : null),
      h('div', { class: 's' }, E.fmtDay(r.day) + ' · ' + (r.lines && r.lines.length ? plural(r.lines.length, 'line', 'lines') : 'total only'))),
    h('div', { class: 'amt' }, E.money(r.total)));
}
function allShops() { sheet('All shops', () => h('div', { class: 'card flush' }, [...S.get().receipts].sort((a, b) => b.day - a.day).map(shopRow))); }
function shopSheet(id) {
  const r = S.get().receipts.find((x) => x.id === id); if (!r) return;
  return sheet(r.store || 'Shop', (close) => {
    const body = h('div');
    A(body, h('div', { class: 'card' }, h('div', { class: 'meta' }, E.fmtDay(r.day) + (r.barcode ? ' · barcode saved' : '') + (r.cash ? ' · cash' : '')), h('div', { style: 'font-size:28px;font-weight:700' }, E.money(r.total))));
    if (r.lines && r.lines.length) A(body, h('div', { class: 'card flush' }, r.lines.map((l) => h('div', { class: 'row' }, h('div', { class: 'cat' }, EMOJI[l.cat] || '🛒'),
      h('div', { class: 'grow' }, h('div', { class: 't' }, l.name), h('div', { class: 's' }, (l.qty !== 1 ? l.qty + ' × ' : '') + l.cat)), h('div', { class: 'amt' }, E.money(l.total))))));
    const ph = h('div'); A(body, ph);
    (r.photoIds || []).forEach(async (pid) => { const b = await S.getPhoto(pid); if (b) ph.append(h('img', { class: 'photo', alt: 'Receipt photo', src: URL.createObjectURL(b) })); });
    A(body, h('div', { class: 'actions' }, h('button', { onclick: () => editShop(id) }, 'Edit this shop'),
      h('button', { class: 'danger', onclick: () => { if (confirm('Delete this shop?')) { S.removeReceipt(id); close(); render(); toast('Shop deleted'); } } }, 'Delete')));
    return body;
  });
}

// ---------- DUE NOW ----------
function dueScreen() {
  const st = S.get(), rs = st.receipts, t = today(), lvl = E.dataLevel(rs, t);
  const wrap = h('div');
  A(wrap, h('div', { class: 'head' }, h('h1', null, 'Due now'), h('span', { class: 'meta' }, E.fmtDay(t))));
  if (lvl < 3) {
    const n = shopsWithLines(rs);
    const sample = [['🥛', 'Milk 2L', 'every 4 days', '$9.20'], ['🍞', 'Bread loaf', 'every 4 days', '$7.20'], ['🥚', 'Eggs 12 pack', 'every 9 days', '$8.20']];
    A(wrap, h('div', { class: 'card preview' },
      h('div', { class: 'veil' }, sample.map(([e, a, b, c]) => h('div', { class: 'row' }, h('div', { class: 'cat' }, e), h('div', { class: 'grow' }, h('div', { class: 't' }, a), h('div', { class: 's' }, b)), h('div', { class: 'amt' }, c)))),
      h('div', { class: 'note' }, h('div', null, h('h3', null, 'Your usual, due now'), h('p', { class: 'meta small', style: 'margin:6px 0 10px' }, 'Example only. Add item lines for 3 or more shops and this fills in with your own items and their last prices.'), toAdd('Add a shop with lines')))));
    A(wrap, h('div', { class: 'card' }, h('div', { class: 'progress' }, h('i', { style: `width:${Math.min(1, n / 3) * 100}%` })), h('div', { class: 'meta small' }, `${n} of 3 shops with item lines`)));
    return wrap;
  }
  const due = dueFor(st, t), prefs = st.itemPrefs || {};
  const dueIds = new Set(due.map((d) => d.id));
  const soon = E.dueList(rs, t + 7).filter((d) => !dueIds.has(d.id) && !(prefs[d.id] && (prefs[d.id].stopped || (prefs[d.id].snoozeUntil || 0) > t)) && d.interval - (t - d.lastDay) > 0);
  const snoozed = Object.entries(prefs).filter(([, p]) => p.snoozeUntil && p.snoozeUntil > t).length;
  const ticks = st.ticks || (st.ticks = {});
  const key = (d) => d.id + ':' + d.lastDay;
  const totalEl = h('div', { class: 'big', style: 'font-size:34px' }), subEl = h('div', { class: 'sub' });
  const upd = () => { const open = due.filter((d) => !ticks[key(d)]); countTo(totalEl, E.dueTotal(open)); subEl.textContent = `${plural(open.length, 'item', 'items')} left, at what you paid last time`; };
  A(wrap, h('div', { class: 'hero rise' }, h('div', { class: 'lab' }, 'Next shop, if you buy the usual'), totalEl, subEl));
  upd();
  if (!due.length) A(wrap, h('div', { class: 'card empty' }, emptyArt(), h('h3', null, 'Nothing due right now'), h('p', null, soon.length ? 'Your usual items are all within their gap. See what is coming up below.' : 'Your usual items are all within their gap.')));
  else {
    const list = h('div', { class: 'card flush' });
    const draw = (limit) => {
      list.replaceChildren();
      due.slice(0, limit).forEach((d, i) => {
        const row = h('div', { class: 'row rise' + (d.over > 0 ? ' edge-amber' : ''), style: `animation-delay:${Math.min(i, 10) * 25}ms` });
        const tick = h('button', { class: 'tick', role: 'checkbox', 'aria-checked': !!ticks[key(d)], 'aria-label': 'Got ' + d.name, onclick: () => { ticks[key(d)] = !ticks[key(d)]; if (!ticks[key(d)]) delete ticks[key(d)]; S.save(); tick.setAttribute('aria-checked', !!ticks[key(d)]); row.classList.toggle('done', !!ticks[key(d)]); tick.textContent = ticks[key(d)] ? '✓' : ''; upd(); } }, ticks[key(d)] ? '✓' : '');
        if (ticks[key(d)]) row.classList.add('done');
        row.append(tick, h('div', { class: 'cat' }, EMOJI[d.cat] || '🛒'),
          h('div', { class: 'grow' }, h('div', { class: 't' }, d.name), h('div', { class: 's' }, `Last ${E.fmtShort(d.lastDay)} · every ${d.interval} days`)),
          h('div', { style: 'text-align:right' }, h('div', { class: 'amt' }, E.money(d.lastPaid)), h('div', { class: 'tag ' + (d.over > 0 ? 'amber' : 'meta') }, d.over > 0 ? `${d.over}d over` : d.over === 0 ? 'due today' : `in ${-d.over}d`)),
          h('button', { class: 'menu-btn', 'aria-label': 'Options for ' + d.name, onclick: () => itemMenu(d) }, '⋯'));
        list.append(row);
      });
      if (due.length > limit) list.append(h('div', { class: 'row' }, h('button', { class: 'full', onclick: () => draw(due.length) }, `Show all ${due.length}`)));
    };
    draw(8); A(wrap, list);
    const text = () => 'Shopping list\n' + due.filter((d) => !ticks[key(d)]).map((d) => '- ' + d.name).join('\n');
    A(wrap, h('div', { class: 'actions' },
      h('button', { onclick: async () => { try { await navigator.clipboard.writeText(text()); toast('List copied'); } catch { toast('Could not copy'); } } }, 'Copy list'),
      navigator.share ? h('button', { onclick: () => navigator.share({ text: text() }).catch(() => {}) }, 'Share list') : null));
  }
  if (soon.length) A(wrap, h('h2', null, 'Coming up this week'), h('div', { class: 'card flush' }, soon.map((d) => h('div', { class: 'row' }, h('div', { class: 'cat' }, EMOJI[d.cat] || '🛒'),
    h('div', { class: 'grow' }, h('div', { class: 't' }, d.name), h('div', { class: 's' }, `Usually every ${d.interval} days`)), h('div', { class: 'tag meta' }, `in ${d.interval - (t - d.lastDay)}d`)))));
  A(wrap, h('p', { class: 'meta small', style: 'margin-top:8px' }, 'Your usual items are the ones you buy at a steady gap, 3 or more times. This is your own history, not a recommendation.' + (snoozed ? ` ${plural(snoozed, 'item is', 'items are')} snoozed.` : '')));
  return wrap;
}
function itemMenu(d) {
  sheet(d.name, (close) => {
    const nm = h('input', { id: 'rn', value: d.name, 'aria-label': 'New name' });
    return h('div', null,
      h('div', { class: 'card' }, h('div', { class: 'meta' }, `Usually every ${d.interval} days · last paid ${E.money(d.lastPaid)}`)),
      h('div', { class: 'card' },
        h('div', { class: 'actions', style: 'margin:0' },
          h('button', { onclick: () => { S.setItemPref(d.id, { snoozeUntil: today() + 7 }); close(); render(); toast('Hidden for a week'); } }, 'Hide for a week'),
          h('button', { onclick: () => { S.setItemPref(d.id, { stopped: true }); close(); render(); toast('Removed from your list. Bring it back in More.'); } }, 'I have stopped buying this'))),
      h('div', { class: 'card' }, h('label', { for: 'rn', style: 'margin-top:0' }, 'Rename, or merge into an item you already have'), nm,
        h('p', { class: 'meta small', style: 'margin-top:6px' }, 'Type the name of another item to merge their history. The usual gap is worked out again.'),
        h('div', { class: 'actions' }, h('button', { onclick: () => { if (!nm.value.trim()) return; const n = S.renameItem(d.id, nm.value); close(); render(); toast(`Updated ${plural(n, 'line', 'lines')}`); } }, 'Rename or merge'))));
  });
}

// ---------- ADD ----------
let addDraft = null;
const newDraft = () => ({ store: '', day: today(), total: '', mode: 'total', lines: [], gst: '', count: '', cash: false, barcode: null, photos: [], photoIds: [], t0: null, dayTouched: false, editId: null });
function editShop(id) {
  const r = S.get().receipts.find((x) => x.id === id); if (!r) return;
  const d = newDraft(); Object.assign(d, { editId: id, store: r.store, day: r.day, dayTouched: true, total: fmtDec(r.total), cash: !!r.cash, photoIds: [...(r.photoIds || [])], barcode: r.barcode ? E.parseBarcode(r.barcode) : null });
  d.mode = r.lines && r.lines.length ? 'lines' : 'total';
  d.lines = (r.lines || []).map((l) => ({ name: l.name, qty: String(l.qty), total: fmtDec(l.total), item: l.item, cat: l.cat, catSet: true, sug: null }));
  addDraft = d; keepDraft = true;
  if (location.hash === '#add') { route = 'add'; render(); scrollTo(0, 0); } else location.hash = '#add';
}
function addScreen() {
  const st = S.get(), d = addDraft || (addDraft = newDraft());
  const wrap = h('div');
  A(wrap, h('div', { class: 'head' }, h('h1', null, d.editId ? 'Edit shop' : 'Add a shop')));
  const touch = () => { if (!d.t0) d.t0 = performance.now(); };
  const realN = st.receipts.filter((r) => !r.sample).length;
  if (!d.editId && realN < 3) A(wrap, h('div', { class: 'card coach' }, h('h3', null, `Getting started: your last 3 shops (${realN} of 3)`),
    h('p', { class: 'meta', style: 'margin:6px 0 0' }, 'Start with your most recent receipt and use the date on it. With item lines, your usual list appears after 3 shops. Totals only still gives you spend and rhythm.')));

  // photo + barcode
  const info = h('div'), thumbs = h('div', { class: 'thumbs' });
  (d.photoIds || []).forEach(async (pid) => { const b = await S.getPhoto(pid); if (b) thumbs.append(h('img', { alt: 'Receipt photo', src: URL.createObjectURL(b) })); });
  d.photos.forEach((b) => thumbs.append(h('img', { alt: 'Receipt photo', src: URL.createObjectURL(b) })));
  const file = h('input', { type: 'file', accept: 'image/*', class: 'hide', id: 'photo', onchange: async (e) => {
    const f = e.target.files[0]; if (!f) return; touch(); info.replaceChildren(h('p', { class: 'meta small' }, 'Reading the barcode on this device…'));
    try {
      const bc = await readReceiptBarcode(f);
      d.photos.push(await S.shrink(f));
      thumbs.append(h('img', { alt: 'Receipt photo', src: URL.createObjectURL(d.photos[d.photos.length - 1]) }));
      if (bc && bc.raw && !d.barcode) {
        d.barcode = bc; if (bc.day && !d.dayTouched) { d.day = bc.day; dateEl.value = E.isoFromDay(bc.day); }
        info.replaceChildren(h('div', { class: 'check ok' }, '✓ Barcode read. ', bc.day ? `Dated ${E.fmtDay(bc.day)}, till ${bc.till}, transaction ${bc.txn}.` : `Till ${bc.till}, transaction ${bc.txn}.`));
      } else if (bc && bc.raw && d.barcode && bc.raw === d.barcode.raw) info.replaceChildren(h('div', { class: 'check ok' }, '✓ Same transaction as the first photo. Photos joined.'));
      else if (bc && bc.raw) info.replaceChildren(h('div', { class: 'check warn' }, 'This barcode is a different receipt from the first photo. Check you are adding to the right shop.'));
      else info.replaceChildren(h('div', { class: 'check warn' }, 'No barcode found in that photo. You can still type the shop in. For a long receipt, add the other photo too.'));
    } catch { info.replaceChildren(h('div', { class: 'check warn' }, 'Could not use that photo.')); }
    e.target.value = ''; refresh();
  } });
  A(wrap, h('div', { class: 'card' }, h('h3', null, 'Receipt photo'),
    h('p', { class: 'meta small', style: 'margin:4px 0 10px' }, 'Optional. Kept on this device. The barcode gives the date and flags a receipt you have already added. Long receipt: add a photo of each part.'),
    h('div', { class: 'actions', style: 'margin-top:0' }, h('label', { for: 'photo', class: 'btn', style: 'margin:0;color:var(--ink);font-size:16px', role: 'button' }, 'Take or choose a photo')), file, info, thumbs));

  // details
  const storeEl = h('input', { id: 'store', list: 'stores', placeholder: 'e.g. Supermarket A', value: d.store, autocomplete: 'off', oninput: (e) => { touch(); d.store = e.target.value; refresh(); } });
  const dateEl = h('input', { id: 'date', type: 'date', value: E.isoFromDay(d.day), max: E.isoFromDay(today()), onchange: (e) => { touch(); d.dayTouched = true; d.day = E.dayFromISO(e.target.value) || d.day; refresh(); } });
  const totalEl = h('input', { id: 'total', inputmode: 'decimal', placeholder: '0.00', value: d.total, oninput: (e) => { touch(); d.total = e.target.value; refresh(); } });
  const stores = [...new Set(st.receipts.map((r) => r.store).filter(Boolean))];
  A(wrap, h('div', { class: 'card' },
    h('label', { for: 'store', style: 'margin-top:0' }, 'Store'), storeEl, h('datalist', { id: 'stores' }, stores.map((s) => h('option', { value: s }))),
    h('div', { class: 'two' }, h('div', null, h('label', { for: 'date' }, 'Date'), dateEl), h('div', null, h('label', { for: 'total' }, 'Till total'), totalEl))));

  // mode
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'How much detail' },
    [['total', 'Total only'], ['lines', 'Add the lines']].map(([m, l]) => h('button', { 'aria-pressed': d.mode === m, onclick: () => { d.mode = m; if (m === 'lines' && !d.lines.length) addLine(); rerender(); } }, l)));
  A(wrap, seg, h('p', { class: 'meta small', style: 'margin:6px 2px 12px' }, 'Total only takes seconds and feeds your spend and rhythm. Lines also feed your usual list and price moves.'));

  const ll = lastLines(st.receipts);
  if (ll.length) A(wrap, h('div', { class: 'card' }, h('h3', null, 'Quick add'),
    h('p', { class: 'meta small', style: 'margin:4px 0 0' }, 'Fill the lines from what you bought before, then fix the prices. You still type the till total, so the check runs against the receipt.'),
    h('div', { class: 'actions' }, h('button', { onclick: () => quickPick(ll, d, st) }, 'Pick from my usual items'), h('button', { onclick: () => repeatLast(d, st) }, 'Repeat my last shop'))));

  const lineBox = h('div'); A(wrap, lineBox);
  const known = () => knownItems(st.receipts).concat(d.lines.filter((l) => l.item && l.name).map((l) => ({ item: l.item, name: l.name, cat: l.cat })));
  function addLine() { d.lines.push({ name: '', qty: '', total: '', item: '', cat: 'Other', sug: null }); }
  function drawLines() {
    lineBox.replaceChildren(); if (d.mode !== 'lines') return;
    const box = h('div', { class: 'lines' });
    d.lines.forEach((l, i) => {
      const catBtn = h('button', { class: 'chip', style: 'min-height:30px;padding:3px 10px', onclick: () => { l.cat = E.CATS[(E.CATS.indexOf(l.cat) + 1) % E.CATS.length]; l.catSet = true; draw(); } });
      const sugEl = h('div', { class: 'sug' });
      const draw = () => { catBtn.textContent = (EMOJI[l.cat] || '🛒') + ' ' + l.cat; sugEl.replaceChildren(catBtn); if (l.sug) sugEl.append(' ', h('span', { class: 'meta' }, 'Same as ' + l.sug.name + '? '), h('button', { onclick: () => { l.item = l.sug.item; l.name = l.sug.name; l.cat = l.sug.cat; l.sug = null; rerender(); } }, 'Yes')); };
      const nameEl = h('input', { 'aria-label': 'Item', placeholder: 'Item', value: l.name, autocomplete: 'off', oninput: (e) => {
        touch(); l.name = e.target.value; l.item = E.itemKey(l.name);
        if (!l.catSet) l.cat = E.guessCategory(l.name);
        const s = E.suggestItem(l.name, known().filter((k) => k.item !== l.item));
        l.sug = s && s.item !== l.item ? s : null; draw(); refresh(); } });
      box.append(h('div', { class: 'ln' }, nameEl,
        h('input', { 'aria-label': 'Quantity', inputmode: 'decimal', placeholder: 'Qty', value: l.qty, oninput: (e) => { touch(); l.qty = e.target.value; refresh(); } }),
        h('input', { 'aria-label': 'Line total', inputmode: 'decimal', placeholder: '0.00', value: l.total, oninput: (e) => { touch(); l.total = e.target.value; refresh(); } }),
        h('button', { class: 'x ghost', 'aria-label': 'Remove line', onclick: () => { d.lines.splice(i, 1); rerender(); } }, '✕'), sugEl));
      draw();
    });
    lineBox.append(h('div', { class: 'card' }, box, h('p', { class: 'meta small', style: 'margin:10px 0 0' }, 'Discounts on the receipt: enter a negative amount, like -1.50.'),
      h('div', { class: 'actions' }, h('button', { onclick: () => { addLine(); rerender(); setTimeout(() => document.querySelector('.ln:last-of-type input')?.focus(), 0); } }, '+ Add a line'))),
      h('details', { class: 'card' }, h('summary', { style: 'cursor:pointer;font-weight:600' }, 'Extra checks from the receipt (optional)'),
        h('div', { class: 'two' }, h('div', null, h('label', null, 'GST printed'), h('input', { inputmode: 'decimal', placeholder: '0.00', value: d.gst, oninput: (e) => { d.gst = e.target.value; refresh(); } })),
          h('div', null, h('label', null, 'Item count printed'), h('input', { inputmode: 'numeric', placeholder: 'e.g. 10', value: d.count, oninput: (e) => { d.count = e.target.value; refresh(); } }))),
        h('label', { class: 'cashrow' }, h('input', { type: 'checkbox', checked: d.cash ? true : null, onchange: (e) => { d.cash = e.target.checked; refresh(); } }), 'Paid in cash (cash totals round to the nearest 10c)')));
  }
  drawLines();

  // check + save
  const checkBox = h('div'), saveRow = h('div', { class: 'actions' });
  A(wrap, checkBox, saveRow);
  function parsed() {
    const total = E.parseMoney(d.total);
    const lines = d.lines.filter((l) => l.name.trim() || l.total.trim()).map((l) => {
      const qty = E.parseQty(l.qty), tot = E.parseMoney(l.total), disc = tot != null && tot < 0;
      return { name: l.name.trim(), item: disc ? '' : (l.item || E.itemKey(l.name)), cat: disc ? 'Discounts' : l.cat, qty, total: tot, unit: qty && tot != null ? Math.round(tot / qty) : null };
    });
    return { total, lines, bad: lines.some((l) => !l.name || l.qty == null || l.total == null) };
  }
  function build() {
    const p = parsed(), orig = d.editId ? st.receipts.find((x) => x.id === d.editId) : null;
    const r = { ...(orig || {}), id: d.editId || S.uid(), store: d.store.trim() || 'Shop', day: d.day, total: p.total, mode: d.mode === 'lines' ? 'lines' : 'total', source: 'typed', cash: !!d.cash, lines: d.mode === 'lines' ? p.lines.map(({ name, item, cat, qty, unit, total }) => ({ name, item, cat, qty, unit, total })) : [] };
    if (d.barcode && d.barcode.raw) r.barcode = d.barcode.raw;
    return r;
  }
  function refresh() {
    const p = parsed(), cs = [];
    let canSave = p.total != null && p.total > 0, label = d.editId ? 'Save changes' : 'Save shop', saveTotalOnly = false;
    if (p.total == null && d.total) cs.push(['bad', '✕ The till total is not an amount.']);
    if (d.mode === 'lines') {
      if (p.bad) { cs.push(['warn', 'Each line needs an item and a total. Leave the quantity empty for 1.']); canSave = false; }
      else if (p.lines.length && p.total != null) {
        const rc = E.reconcile(p.lines.map((l) => ({ qty: l.qty, unit: l.unit, total: l.total })), p.total, { cash: d.cash });
        if (rc.reconciled) cs.push(['ok', `✓ Lines add up to ${E.money(rc.linesTotal)}. Matches the till total.`]);
        else { cs.push(['bad', `✕ Lines add up to ${E.money(rc.linesTotal)}. The till total is ${E.money(p.total)}. Difference ${E.money(Math.abs(rc.difference))}. Check the lines.`]); canSave = false; saveTotalOnly = true; }
        const g = E.checkGst(p.total, E.parseMoney(d.gst)); if (g) cs.push([g.ok ? 'ok' : 'warn', g.ok ? '✓ GST matches the total.' : `GST should be about ${E.money(g.expected)} for this total. Check the total.`]);
        const ic = E.checkItemCount(p.lines.map((l) => ({ qty: l.qty, total: l.total })), d.count ? parseInt(d.count, 10) : null); if (ic) cs.push([ic.ok ? 'ok' : 'warn', ic.ok ? '✓ Item count matches.' : `You have ${ic.counted} items. The receipt says ${ic.printed}.`]);
      } else if (!p.lines.length) canSave = false;
    }
    if (d.barcode && d.barcode.day && d.barcode.day !== d.day) cs.push(['warn', `The barcode says ${E.fmtDay(d.barcode.day)}. The date above is ${E.fmtDay(d.day)}.`]);
    if (p.total != null) {
      const dup = E.findDuplicate(st.receipts, { id: d.editId || '_', store: d.store.trim() || 'Shop', day: d.day, total: p.total, barcode: d.barcode && d.barcode.raw });
      if (dup) { cs.push(['warn', `Looks like a shop you already added: ${dup.store}, ${E.fmtDay(dup.day)}, ${E.money(dup.total)}.`]); label = d.editId ? label : 'Save anyway'; }
    }
    checkBox.replaceChildren(...cs.map(([k, m]) => h('div', { class: 'check ' + k, role: k === 'bad' ? 'alert' : null }, m)));
    saveRow.replaceChildren(...[h('button', { class: 'fill', disabled: !canSave, onclick: () => doSave(build(), false) }, label),
      saveTotalOnly && p.total ? h('button', { onclick: () => doSave({ ...build(), mode: 'total', lines: [] }, true) }, 'Save the total only') : null].filter(Boolean));
  }
  async function doSave(r, totalOnly) {
    const sec = d.t0 ? (performance.now() - d.t0) / 1000 : 0, editing = !!d.editId;
    try { r.photoIds = [...(d.photoIds || [])]; for (const b of d.photos) { const pid = S.uid('p'); await S.putPhoto(pid, b); r.photoIds.push(pid); } } catch { r.photoIds = r.photoIds || []; }
    if (editing) S.updateReceipt(r); else S.addReceipt(r);
    if (sec && !editing) S.logEntrySeconds(sec); S.save();
    addDraft = null;
    const n = S.get().receipts.filter((x) => !x.sample).length;
    if (!editing && n < 3) { toast(`Shop ${n} of 3 added`); render(); scrollTo(0, 0); return; }
    toast(editing ? 'Changes saved' : totalOnly ? 'Saved the total' : 'Shop saved'); location.hash = '#spend'; go();
  }
  refresh();

  A(wrap, h('div', { class: 'card lock', style: 'margin-top:16px' }, h('div', { class: 'ic' }, '🔒'),
    h('div', null, h('h3', null, 'Read a receipt for me'), h('div', { class: 'meta small' }, 'Photo in, lines out, checked against the total. Home and Plus plans. Not in this version.'))));
  return wrap;
}
function lineFromLast(l) { return { name: l.name, qty: String(l.qty), total: fmtDec(l.total), item: l.item, cat: l.cat, catSet: true, sug: null }; }
function appendLines(d, news) { d.lines = d.lines.filter((l) => l.name.trim() || l.total.trim()).concat(news); d.mode = 'lines'; }
function repeatLast(d, st) {
  const lf = E.withLines(st.receipts).sort((a, b) => a.day - b.day).pop(); if (!lf) return;
  const news = lf.lines.filter((l) => l.item && l.total > 0).map((l) => lineFromLast({ ...l }));
  appendLines(d, news);
  rerender(); toast(`Added ${plural(news.length, 'line', 'lines')} from ${E.fmtDay(lf.day)}`);
}
function quickPick(ll, d, st) {
  const dueIds = new Set(dueFor(st, today()).map((x) => x.id));
  const items = [...ll].sort((a, b) => (dueIds.has(b.item) - dueIds.has(a.item)) || b.count - a.count || a.name.localeCompare(b.name));
  sheet('Pick from your usual items', (close) => {
    const chosen = new Set(), btn = h('button', { class: 'fill full', disabled: true }, 'Add items');
    const upd = () => { btn.disabled = !chosen.size; btn.textContent = chosen.size ? `Add ${plural(chosen.size, 'item', 'items')}` : 'Add items'; };
    btn.onclick = () => { appendLines(d, items.filter((i) => chosen.has(i.item)).map(lineFromLast)); close(); rerender(); };
    return h('div', null, h('p', { class: 'meta small' }, 'Items due now come first. Prices are what you paid last time. Fix them on the lines.'),
      h('div', { class: 'card flush' }, items.map((i) => h('label', { class: 'pick', style: 'margin:0;font-size:16px;color:var(--ink);font-weight:500' },
        h('input', { type: 'checkbox', style: 'width:22px;height:22px;min-height:0', onchange: (e) => { e.target.checked ? chosen.add(i.item) : chosen.delete(i.item); upd(); } }),
        h('div', { class: 'cat' }, EMOJI[i.cat] || '🛒'), h('div', { class: 'grow', style: 'flex:1;min-width:0' }, h('div', { class: 't' }, i.name), dueIds.has(i.item) ? h('div', { class: 'tag amber' }, 'Due now') : null), h('div', { class: 'amt' }, E.money(i.total))))), h('div', { class: 'actions' }, btn));
  });
}

// ---------- WALLET ----------
function walletScreen() {
  const st = S.get(), t = today();
  const wrap = h('div'); A(wrap, h('div', { class: 'head' }, h('h1', null, 'Wallet'), h('span', { class: 'meta' }, 'Coupons and codes')));
  const cs = [...st.coupons].sort((a, b) => (a.used - b.used) || ((a.expires ?? 1e9) - (b.expires ?? 1e9)));
  const soon = cs.filter((c) => E.couponState(c, t) === 'soon');
  if (soon.length) A(wrap, h('div', { class: 'banner amber' }, '⏳ ' + plural(soon.length, 'coupon expires', 'coupons expire') + ' within 3 days.'));
  A(wrap, h('div', { class: 'actions', style: 'margin:0 0 12px' }, h('button', { class: 'fill', onclick: () => couponForm() }, '+ Add a coupon')));
  if (!cs.length) { A(wrap, empty('Keep your discount codes handy', 'Fuel discounts and vouchers from the bottom of a receipt. Photograph it, add the code and the expiry, and pull it up at the counter.', null)); return wrap; }
  A(wrap, h('div', { class: 'card flush' }, cs.map((c) => {
    const s = E.couponState(c, t);
    return h('div', { class: 'row ' + ({ used: '', expired: 'edge-attn', soon: 'edge-amber', active: 'edge-good' })[s], role: 'button', tabindex: 0, onclick: () => couponView(c.id), onkeydown: (e) => { if (e.key === 'Enter') couponView(c.id); } },
      h('div', { class: 'cat' }, '🎟️'), h('div', { class: 'grow' }, h('div', { class: 't' }, c.label), h('div', { class: 's' }, c.expires != null ? 'Expires ' + E.fmtDay(c.expires) : 'No expiry')),
      h('div', { class: 'tag ' + ({ used: 'meta', expired: 'attn', soon: 'amber', active: 'good' })[s] }, { used: 'Used', expired: '✕ Expired', soon: '⏳ Soon', active: '● Active' }[s]));
  })));
  return wrap;
}
function couponForm() {
  let photo = null;
  sheet('Add a coupon', (close) => {
    const label = h('input', { id: 'cl', placeholder: 'e.g. 20c a litre fuel discount' }), code = h('input', { id: 'cc', placeholder: 'Number under the barcode', inputmode: 'text' });
    const exp = h('input', { id: 'ce', type: 'date' }), note = h('input', { id: 'cn', placeholder: 'Optional' });
    const prev = h('div'), f = h('input', { type: 'file', accept: 'image/*', id: 'cp', class: 'hide', onchange: async (e) => { const x = e.target.files[0]; if (!x) return; photo = await S.shrink(x); prev.replaceChildren(h('img', { class: 'photo', alt: 'Coupon photo', src: URL.createObjectURL(photo) })); } });
    return h('div', null, h('div', { class: 'card' },
      h('label', { for: 'cl', style: 'margin-top:0' }, 'What is it'), label, h('label', { for: 'cc' }, 'Code'), code,
      h('label', { for: 'ce' }, 'Expires'), exp, h('label', { for: 'cn' }, 'Note'), note,
      h('div', { class: 'actions' }, h('label', { for: 'cp', class: 'btn', role: 'button', style: 'margin:0;color:var(--ink);font-size:16px' }, 'Photo of the coupon')), f, prev),
      h('div', { class: 'actions' }, h('button', { class: 'fill', onclick: async () => {
        if (!label.value.trim()) { toast('Add a name for it'); return; }
        const c = { id: S.uid('c'), label: label.value.trim(), code: code.value.trim(), expires: E.dayFromISO(exp.value), note: note.value.trim(), used: false, added: today() };
        if (photo) { c.photoId = S.uid('p'); await S.putPhoto(c.photoId, photo); }
        S.addCoupon(c); close(); render(); toast('Coupon saved'); } }, 'Save coupon')));
  });
}
function couponView(id) {
  const c = S.get().coupons.find((x) => x.id === id); if (!c) return;
  sheet(c.label, (close) => {
    const body = h('div');
    if (c.code) A(body, h('div', { class: 'card' }, h('div', { class: 'code' }, c.code)));
    A(body, h('div', { class: 'card' }, h('div', { class: 'meta' }, c.expires != null ? 'Expires ' + E.fmtDay(c.expires) : 'No expiry'), c.note ? h('p', null, c.note) : null));
    if (c.photoId) { const box = h('div'); A(body, box); S.getPhoto(c.photoId).then((b) => b && box.append(h('img', { class: 'photo', style: 'max-height:none', alt: 'Coupon photo', src: URL.createObjectURL(b) }))); }
    A(body, h('div', { class: 'actions' },
      h('button', { class: 'fill', onclick: () => { c.used = !c.used; S.save(); close(); render(); } }, c.used ? 'Mark as not used' : 'Mark as used'),
      h('button', { class: 'danger', onclick: () => { if (confirm('Delete this coupon?')) { S.removeCoupon(id); close(); render(); } } }, 'Delete')));
    return body;
  });
}

// ---------- MORE ----------
const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function csvExport() {
  const rows = [['Date', 'Store', 'Shop total', 'Item', 'Category', 'Qty', 'Line total']];
  for (const r of [...S.get().receipts].sort((a, b) => a.day - b.day)) {
    if (r.lines && r.lines.length) r.lines.forEach((l, i) => rows.push([E.isoFromDay(r.day), r.store, i === 0 ? fmtDec(r.total) : '', l.name, l.cat, l.qty, fmtDec(l.total)]));
    else rows.push([E.isoFromDay(r.day), r.store, fmtDec(r.total), '', '', '', '']);
  }
  const blob = new Blob([rows.map((r) => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `hosti-home-shops-${E.isoFromDay(today())}.csv` }); document.body.append(a); a.click(); a.remove();
  toast('Spreadsheet file saved');
}
function moreScreen() {
  const st = S.get(), wrap = h('div');
  A(wrap, h('div', { class: 'head' }, h('h1', null, 'More')));
  const bud = h('input', { id: 'mb', inputmode: 'decimal', value: st.budget ? (st.budget / 100).toString() : '', placeholder: 'Not set' });
  const wk = h('select', { id: 'wk', onchange: (e) => { st.weekStart = +e.target.value; S.save(); toast('Week start saved'); } }, DAYS.map(([v, n]) => h('option', { value: v, selected: +v === st.weekStart ? true : null }, n)));
  A(wrap, h('div', { class: 'card' }, h('label', { for: 'mb', style: 'margin-top:0' }, 'Monthly grocery budget'), bud,
    h('p', { class: 'meta small', style: 'margin:6px 0 0' }, 'Your weekly figure is this times 7, divided by the days in the month.'),
    h('div', { class: 'actions' }, h('button', { onclick: () => { const b = E.parseMoney(bud.value); st.budget = b && b > 0 ? b : 0; S.save(); toast('Budget saved'); } }, 'Save budget')),
    h('label', { for: 'wk' }, 'Your week starts on'), wk));

  const times = st.entry || [];
  const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;
  A(wrap, h('h2', null, 'Time to add a shop'), h('div', { class: 'card' }, avg == null ? h('p', { class: 'meta' }, 'Add a shop and your average entry time shows here. It is measured on this device only.') :
    h('div', null, h('div', { style: 'font-size:28px;font-weight:700' }, avg >= 90 ? Math.floor(avg / 60) + ' min ' + (avg % 60) + ' s' : avg + ' s'), h('div', { class: 'meta small' }, `average over your last ${plural(times.length, 'shop', 'shops')}`))));

  A(wrap, h('h2', null, 'Sample data'), h('div', { class: 'card' },
    S.hasSample() ? h('div', null, h('p', { class: 'meta' }, 'Sample shops are loaded. They are invented.'), h('button', { class: 'full', onclick: () => { S.removeSample(); render(); toast('Sample data removed'); } }, 'Remove sample data'))
      : h('div', null, h('p', { class: 'meta' }, 'Load an invented household to see the full app.'), h('button', { class: 'full', onclick: () => { st.receipts.push(...sampleReceipts(today())); S.save(); render(); toast('Sample data loaded'); } }, 'Load sample data'))));

  const file = h('input', { type: 'file', accept: 'application/json,.json', class: 'hide', id: 'rest', onchange: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { await S.importAll(await f.text()); toast('Backup restored'); render(); } catch (err) { toast(err.message || 'Could not restore'); }
    e.target.value = ''; } });
  A(wrap, h('h2', null, 'Your data'), h('div', { class: 'card' },
    h('p', { class: 'meta' }, 'Everything lives on this device. A backup is one file with your shops, coupons and photos. The spreadsheet file opens in any spreadsheet app.'),
    h('div', { class: 'actions' },
      h('button', { onclick: async () => { const blob = new Blob([await S.exportAll()], { type: 'application/json' }); const a = h('a', { href: URL.createObjectURL(blob), download: `hosti-home-backup-${E.isoFromDay(today())}.json` }); document.body.append(a); a.click(); a.remove(); toast('Backup saved'); } }, 'Back up'),
      h('label', { for: 'rest', class: 'btn', role: 'button', style: 'margin:0;color:var(--ink);font-size:16px' }, 'Restore')), file,
    h('div', { class: 'actions' }, h('button', { onclick: csvExport }, 'Export to a spreadsheet (CSV)')),
    h('div', { class: 'actions' }, h('button', { class: 'danger', onclick: eraseFlow }, 'Erase everything'))));

  const stopped = Object.entries(st.itemPrefs || {}).filter(([, p]) => p.stopped);
  if (stopped.length) {
    const nameOf = (k) => { for (const r of st.receipts) for (const l of r.lines || []) if (l.item === k) return l.name; return k; };
    A(wrap, h('h2', null, 'Items you stopped buying'), h('div', { class: 'card flush' }, stopped.map(([k]) => h('div', { class: 'row' }, h('div', { class: 'grow t' }, nameOf(k)),
      h('button', { onclick: () => { S.setItemPref(k, null); render(); toast('Back on your list'); } }, 'Bring back')))));
  }

  A(wrap, h('h2', null, 'What the paid plans add'), h('div', { class: 'card flush' }, [
    ['Read a receipt for me', 'Photo in, lines out, checked against the total'],
    ['Pantry and fridge check', 'A photo to confirm what is low before you shop'],
    ['Shared household', 'Up to 5 people on one list'],
    ['Bank totals', 'Spot shops nobody added. Totals only.'],
  ].map(([a, b]) => h('div', { class: 'row lock' }, h('div', { class: 'ic' }, '🔒'), h('div', { class: 'grow' }, h('div', { class: 't' }, a), h('div', { class: 's' }, b))))),
    h('p', { class: 'meta small' }, 'Typing your shops in is free. The paid plans read them for you. Not in this version.'));

  A(wrap, h('h2', null, 'Install'), h('div', { class: 'card' }, h('p', { class: 'meta' }, 'Add this to your home screen so it opens like an app and works offline. On iPhone, tap Share then Add to Home Screen. On Android, open the browser menu then Install app. Installing also stops iPhone from clearing your data after a week of not opening it.')));
  A(wrap, h('p', { class: 'meta small', style: 'margin:16px 0' }, 'Hosti @Home test version. Numbers only: what you spent, what you usually buy, and when. It never says what to eat or where to shop.'));
  return wrap;
}
function eraseFlow() {
  sheet('Erase everything', (close) => h('div', null,
    h('div', { class: 'card' }, h('p', null, 'This deletes every shop, coupon and photo on this device. It cannot be undone. Back up first if you might want them.')),
    h('div', { class: 'actions' }, h('button', { onclick: close }, 'Keep my data'), h('button', { class: 'danger', onclick: async () => { await S.eraseAll(); close(); location.hash = '#spend'; render(); } }, 'Erase everything'))));
}

// ---------- boot ----------
S.load();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(() => {});
window.__hh = { S, E, render }; // handy in the console and for tests
go();
