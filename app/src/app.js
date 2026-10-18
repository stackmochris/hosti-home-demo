// Hosti @Home web app. Local-first: all data stays on this device.
import * as E from './engine.js';
import * as S from './store.js';
import { sampleReceipts } from './sample.js';
import { readReceiptBarcode } from './barcode.js';

const $app = document.getElementById('app');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
let route = 'spend';
const TABS = ['spend', 'due', 'add', 'wallet', 'more'];
const EMOJI = { 'Fruit & veg': '🥦', 'Dairy & eggs': '🥛', 'Meat & fish': '🥩', Bakery: '🍞', Pantry: '🥫', Frozen: '🧊', Drinks: '🧃', Household: '🧻', 'Snacks & treats': '🍫', Other: '🛒' };
const ICON = {
  spend: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" stroke-linecap="round"/>',
  due: '<path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" stroke-linecap="round" stroke-linejoin="round"/>',
  add: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8" stroke-linecap="round"/>',
  wallet: '<path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8z" stroke-linejoin="round"/><path d="M14 6v12" stroke-dasharray="2 3"/>',
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
};
const LABEL = { spend: 'Spend', due: 'Due now', add: 'Add', wallet: 'Wallet', more: 'More' };

// ---------- tiny DOM helper ----------
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
const svg = (inner, attrs = {}) => h('svg', { ns: 1, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, html: inner, ...attrs });
function toast(msg) { const t = h('div', { class: 'toast', role: 'status' }, msg); document.body.append(t); setTimeout(() => t.remove(), 2600); }
function countTo(el, cents, fmt = E.money) {
  if (reduce || cents === 0) { el.textContent = fmt(cents); return; }
  const t0 = performance.now(), dur = 700;
  const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(Math.round(cents * e)); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
const A = (el, ...k) => el.append(...k.flat().filter((x) => x != null && x !== false));
const today = () => E.todayNum();
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

// ---------- shell ----------
function render() {
  const st = S.get();
  document.querySelectorAll('.sheet').forEach((s) => s.remove());
  $app.replaceChildren();
  document.querySelector('nav')?.remove();
  if (!st.onboarded) { $app.append(onboarding()); return; }
  const screens = { spend: spendScreen, due: dueScreen, add: addScreen, wallet: walletScreen, more: moreScreen };
  $app.append(screens[route]());
  const dueN = E.dueList(st.receipts, today()).filter((d) => d.over >= 0).length;
  const walletSoon = st.coupons.filter((c) => ['soon'].includes(E.couponState(c, today()))).length;
  document.body.append(h('nav', { 'aria-label': 'Main' }, h('div', { class: 'in' }, TABS.map((t) =>
    h('a', { href: '#' + t, 'aria-current': t === route ? 'page' : null },
      svg(ICON[t]), LABEL[t],
      t === 'due' && dueN ? h('span', { class: 'badge' }, dueN) : null,
      t === 'wallet' && walletSoon ? h('span', { class: 'badge' }, walletSoon) : null)))));
  window.scrollTo(0, 0);
}
function go() { const r = (location.hash || '#spend').slice(1); route = TABS.includes(r) ? r : 'spend'; addDraft = null; render(); }
addEventListener('hashchange', go);

function sheet(title, build) {
  const close = () => s.remove();
  const s = h('div', { class: 'sheet', role: 'dialog', 'aria-label': title },
    h('div', { class: 'in' }, h('div', { class: 'head' }, h('h1', null, title), h('button', { class: 'ghost', onclick: close }, 'Close')), build(close)));
  document.body.append(s); s.scrollTop = 0; return s;
}

// ---------- onboarding ----------
function onboarding() {
  const budget = h('input', { id: 'bud', inputmode: 'decimal', placeholder: 'e.g. 850' });
  const finish = (sample) => {
    const st = S.get(); st.onboarded = true;
    const b = E.parseMoney(budget.value); st.budget = b && b > 0 ? b : 0;
    if (sample) st.receipts.push(...sampleReceipts(today()));
    S.save(); location.hash = '#spend'; go();
  };
  return h('div', { class: 'rise' },
    h('div', { class: 'head' }, h('h1', null, 'Hosti @Home')),
    h('p', { class: 'meta' }, 'Your groceries, as numbers. What you spent, what you usually buy, and when it runs low.'),
    h('div', { class: 'card' },
      h('h3', null, 'Private by default'),
      h('p', { class: 'meta', style: 'margin-top:6px' }, 'Everything you add stays on this device. There is no account and nothing is sent anywhere. Back it up from More whenever you like.')),
    h('div', { class: 'card' },
      h('label', { for: 'bud', style: 'margin-top:0' }, 'Monthly grocery budget (optional)'),
      budget,
      h('p', { class: 'meta small', style: 'margin-top:6px' }, 'You can change this later. With a budget, you see where you are against a steady pace through the month.')),
    h('div', { class: 'actions' },
      h('button', { class: 'fill', onclick: () => finish(false) }, 'Start with my own shops'),
      h('button', { onclick: () => finish(true) }, 'Look around with sample data')),
    h('p', { class: 'meta small', style: 'margin-top:12px' }, 'Sample data is invented and can be removed in one tap.'));
}

// ---------- shared pieces ----------
function emptyArt() {
  return h('svg', { ns: 1, viewBox: '0 0 120 96', fill: 'none', 'aria-hidden': 'true', html:
    '<rect x="22" y="30" width="76" height="52" rx="10" fill="var(--surface)" stroke="var(--hair)" stroke-width="2"/><path d="M38 30l4-14h36l4 14" stroke="var(--meta)" stroke-width="2" stroke-linejoin="round"/><circle cx="46" cy="82" r="5" fill="var(--ink)"/><circle cx="74" cy="82" r="5" fill="var(--ink)"/><path d="M40 48h40M40 60h26" stroke="var(--hair)" stroke-width="3" stroke-linecap="round"/><circle cx="92" cy="26" r="9" fill="var(--good)"/><path d="M88 26h8M92 22v8" stroke="#fff" stroke-width="2" stroke-linecap="round"/>' });
}
const empty = (title, text, cta) => h('div', { class: 'card empty rise' }, emptyArt(), h('h3', null, title), h('p', null, text), cta);
const toAdd = (label = 'Add a shop') => h('a', { class: 'btn fill', href: '#add' }, label);
const shopsWithLines = (rs) => E.withLines(rs).length;
const knownItems = (rs) => { const m = new Map(); for (const r of E.withLines(rs)) for (const l of r.lines) if (l.item) m.set(l.item, { item: l.item, name: l.name, cat: l.cat }); return [...m.values()]; };

function ring(spent, budget, paceCents) {
  const R = 54, C = 2 * Math.PI * R, k = Math.min(1, spent / budget);
  const tickAngle = Math.min(1, paceCents / budget) * 360;
  const bar = h('circle', { ns: 1, class: 'bar', cx: 66, cy: 66, r: R, fill: 'none', 'stroke-width': 12, 'stroke-linecap': 'round', stroke: spent > paceCents ? 'var(--attn)' : 'var(--good)', 'stroke-dasharray': C, 'stroke-dashoffset': reduce ? C * (1 - k) : C, transform: 'rotate(-90 66 66)' });
  if (!reduce) requestAnimationFrame(() => requestAnimationFrame(() => bar.setAttribute('stroke-dashoffset', C * (1 - k))));
  return h('svg', { ns: 1, class: 'ring', viewBox: '0 0 132 132', role: 'img', 'aria-label': `${Math.round(spent / budget * 100)} percent of budget spent` },
    h('circle', { ns: 1, class: 'trk', cx: 66, cy: 66, r: R, fill: 'none', 'stroke-width': 12 }), bar,
    h('line', { ns: 1, x1: 66, y1: 4, x2: 66, y2: 16, stroke: '#fff', 'stroke-width': 3, 'stroke-linecap': 'round', transform: `rotate(${tickAngle} 66 66)` }),
    h('text', { ns: 1, x: 66, y: 72, 'text-anchor': 'middle', 'font-size': 22 }, Math.round(spent / budget * 100) + '%'));
}

// ---------- SPEND ----------
function spendScreen() {
  const st = S.get(), rs = st.receipts, t = today(), lvl = E.dataLevel(rs, t), pace = E.monthPace(rs, t, st.budget);
  const tp = E.parts(t);
  const wrap = h('div');
  A(wrap, h('div', { class: 'head' }, h('h1', null, 'Spend'), h('span', { class: 'meta' }, E.MONTHS[tp.m] + ' ' + tp.y)));

  // hero
  const big = h('div', { class: 'big' }, E.money(0));
  const hero = h('div', { class: 'hero rise' });
  const left = h('div', null, h('div', { class: 'lab' }, 'Spent this month'), big);
  if (st.budget) left.append(h('div', { class: 'sub' }, `of ${E.money0(st.budget)} budget`));
  left.append(h('div', { class: 'sub' }, `Day ${pace.day} of ${pace.days}`));
  if (lvl && st.budget) {
    const a = pace.ahead;
    left.append(h('div', { class: 'pill ' + (a > 0 ? 'attn' : 'good') }, (a > 0 ? '▲ ' : '▼ ') + E.money0(Math.abs(a)) + (a > 0 ? ' above' : ' below') + ' a steady pace'));
  } else if (!lvl) left.append(h('div', { class: 'pill flat' }, 'Nothing added yet'));
  hero.append(st.budget && lvl ? h('div', { class: 'hero-grid' }, left, ring(pace.spent, st.budget, pace.budgetPace)) : left);
  if (lvl) {
    hero.append(h('div', { class: 'sub', style: 'margin-top:14px;border-top:1px solid var(--hero-line);padding-top:12px' },
      pace.history ? [`At your last 28 days' pace: `, h('b', { style: 'color:#fff' }, E.money0(pace.projected)), ' for the month', st.budget ? (pace.projected > st.budget ? ` (${E.money0(pace.projected - st.budget)} over budget)` : ` (${E.money0(st.budget - pace.projected)} under budget)`) : ''] : 'A month projection starts once you have a week of shops.'));
  }
  A(wrap, hero); countTo(big, pace.spent);

  if (!lvl) {
    A(wrap, empty('Add your first shop', 'Type in a till total and the date. That is enough to start. Add the item lines when you want more.', toAdd()));
    return wrap;
  }

  // months
  const mt = E.monthlyTotals(rs, t, 6), mx = Math.max(...mt.map((m) => m.total), 1);
  A(wrap, h('h2', null, 'Month by month'), h('div', { class: 'card' },
    h('div', { class: 'bars' }, mt.map((m, i) => h('div', { class: 'b' + (m.current ? ' cur' : '') },
      h('div', { class: 'v' }, m.total ? E.money0(m.total) : ''),
      h('div', { class: 'col', style: `height:${Math.max(3, m.total / mx * 78)}px;animation-delay:${i * 60}ms` }),
      h('div', { class: 'l' }, m.label))))));

  // rhythm (works from totals)
  const rh = E.rhythm(rs, t);
  A(wrap, h('h2', null, 'Your shopping rhythm'),
    h('div', { class: 'kpis' },
      h('div', { class: 'kpi' }, h('div', { class: 'v' }, rh.shops ? rh.perWeek.toFixed(1) : '0'), h('div', { class: 'l' }, 'shops a week')),
      h('div', { class: 'kpi' }, h('div', { class: 'v' }, E.money0(rh.avgShop)), h('div', { class: 'l' }, 'average shop')),
      h('div', { class: 'kpi' }, h('div', { class: 'v' }, E.money0(rh.biggest)), h('div', { class: 'l' }, 'biggest shop'))),
    h('div', { class: 'meta small', style: 'margin:-4px 0 12px' }, 'Last 28 days.'));
  const ns = E.nextShop(rs, t);
  if (ns) {
    const away = ns.expectedDay - t;
    A(wrap, h('div', { class: 'card' }, h('h3', null, 'Next shop'),
      h('p', { class: 'meta', style: 'margin-top:6px' }, away > 0 ? `Around ${E.fmtDay(ns.expectedDay)}, ${away === 1 ? 'tomorrow' : 'in ' + away + ' days'}.` : away === 0 ? 'Around today.' : `Your usual gap has passed (${E.fmtDay(ns.expectedDay)}).`),
      h('p', null, 'Typical size ', h('b', { class: 'num' }, E.money(ns.typical)), h('span', { class: 'meta' }, `. Your last ${ns.n} ranged ${E.money0(ns.low)} to ${E.money0(ns.high)}.`))));
  }

  // stores
  const ss = E.storeSplit(rs, t);
  if (ss.length) {
    A(wrap, h('h2', null, 'Where you shop · 90 days'), h('div', { class: 'card' },
      h('div', { class: 'split' }, ss.map((s, i) => h('i', { class: 'c' + Math.min(i, 5), style: `width:${s.share * 100}%` }))),
      ss.slice(0, 5).map((s, i) => h('div', { style: 'display:flex;justify-content:space-between;padding:3px 0' },
        h('span', null, h('span', { class: 'dot c' + Math.min(i, 5) }), s.store), h('span', { class: 'num' }, E.money0(s.cents) + ' · ' + Math.round(s.share * 100) + '%')))));
  }

  // lines-dependent
  if (lvl >= 2) {
    const cs = E.categorySplit(rs, t, 30);
    if (cs.rows.length) {
      const top = cs.rows[0].cents;
      A(wrap, h('h2', null, 'What it went on · 30 days'), h('div', { class: 'card flush' },
        cs.rows.map((r) => h('div', { class: 'row' }, h('div', { class: 'cat' }, EMOJI[r.cat] || '🛒'),
          h('div', { class: 'grow' }, h('div', { class: 't' }, r.cat), h('div', { class: 'progress', style: 'margin:6px 0 0' }, h('i', { style: `width:${r.cents / top * 100}%` }))),
          h('div', { class: 'amt' }, E.money0(r.cents))))),
        cs.covered < cs.all ? h('p', { class: 'meta small' }, `From the ${E.money0(cs.covered)} of ${E.money0(cs.all)} spent that has item lines.`) : null);
    }
  }
  if (lvl === 3) {
    const lf = E.lastFullShop(rs), fb = lf && t - lf.day <= 21 ? E.shopFeedback(rs, lf) : null;
    if (fb) {
      const d = fb.total - fb.listTotal;
      A(wrap, h('h2', null, `Your shop on ${E.fmtDay(fb.day)}`), h('div', { class: 'card flush' },
        h('div', { class: 'row' }, h('div', { class: 'grow t' }, 'This shop'), h('div', { class: 'amt' }, E.money(fb.total))),
        h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 't' }, 'Your usual list that day'), h('div', { class: 's' }, plural(fb.dueCount, 'item', 'items'))), h('div', { class: 'amt' }, E.money(fb.listTotal))),
        h('div', { class: 'row' }, h('div', { class: 'grow t' }, 'Difference'), h('div', { class: 'amt' }, (d > 0 ? '+' : d < 0 ? '-' : '') + E.money(Math.abs(d)))),
        st.budget ? h('div', { class: 'row' }, h('div', { class: 'grow t' }, 'Budget left this month'), h('div', { class: 'amt' }, E.money(pace.left))) : null,
        fb.outside.length ? h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 't' }, 'Outside your list'), h('div', { class: 's' }, fb.outside.map((l) => l.name).slice(0, 6).join(', ') + (fb.outside.length > 6 ? ` and ${fb.outside.length - 6} more` : ''))), h('div', { class: 'amt', style: 'color:var(--amber)' }, E.money(fb.outsideTotal))) : null,
        fb.missed.length ? h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 't' }, 'On your list, not bought'), h('div', { class: 's' }, fb.missed.map((m) => m.name).slice(0, 6).join(', '))), h('div', { class: 'amt' }, E.money(fb.missedTotal))) : null));
    }
    const pm = E.priceMoves(rs, t).slice(0, 5);
    if (pm.length) {
      A(wrap, h('h2', null, 'Prices that moved'), h('div', { class: 'card flush' }, pm.map((m) => h('div', { class: 'row' },
        h('div', { class: 'cat' }, EMOJI[(rs.flatMap((r) => r.lines || []).find((l) => l.item === m.id) || {}).cat] || '🛒'),
        h('div', { class: 'grow' }, h('div', { class: 't' }, m.name), h('div', { class: 's num' }, `${E.money(m.from)} to ${E.money(m.to)}`)),
        h('div', { class: 'tag ' + (m.diff > 0 ? 'attn' : 'good') }, (m.diff > 0 ? '▲ +' : '▼ -') + E.money(Math.abs(m.diff)))))));
    }
  } else {
    const n = shopsWithLines(rs);
    A(wrap, h('div', { class: 'card' }, h('h3', null, lvl === 1 ? 'Unlock more from the same shops' : 'Your usual list is close'),
      h('p', { class: 'meta', style: 'margin-top:6px' }, 'Add the item lines for 3 or more shops. Then you get what you usually buy, what is due now, how your shop compared with your list, and prices that moved.'),
      h('div', { class: 'progress' }, h('i', { style: `width:${Math.min(1, n / 3) * 100}%` })),
      h('div', { class: 'meta small' }, `${n} of 3 shops with item lines`)));
  }

  // recent shops
  const recent = [...rs].sort((a, b) => b.day - a.day || b.id.localeCompare(a.id)).slice(0, 5);
  A(wrap, h('h2', null, 'Recent shops'), h('div', { class: 'card flush' }, recent.map((r) => shopRow(r))),
    rs.length > 5 ? h('button', { class: 'full', onclick: allShops }, `All ${rs.length} shops`) : null);
  return wrap;
}

function shopRow(r) {
  return h('div', { class: 'row', role: 'button', tabindex: 0, onclick: () => shopSheet(r.id), onkeydown: (e) => { if (e.key === 'Enter') shopSheet(r.id); } },
    h('div', { class: 'grow' }, h('div', { class: 't' }, r.store || 'Shop', r.sample ? h('span', { class: 'meta small' }, '  sample') : null),
      h('div', { class: 's' }, E.fmtDay(r.day) + ' · ' + (r.lines && r.lines.length ? plural(r.lines.length, 'line', 'lines') : 'total only'))),
    h('div', { class: 'amt' }, E.money(r.total)));
}
function allShops() {
  sheet('All shops', () => h('div', { class: 'card flush' }, [...S.get().receipts].sort((a, b) => b.day - a.day).map(shopRow)));
}
function shopSheet(id) {
  const r = S.get().receipts.find((x) => x.id === id); if (!r) return;
  const sh = sheet(r.store || 'Shop', (close) => {
    const body = h('div');
    A(body, h('div', { class: 'card' }, h('div', { class: 'meta' }, E.fmtDay(r.day) + (r.barcode ? ' · barcode saved' : '')), h('div', { style: 'font-size:28px;font-weight:700' }, E.money(r.total))));
    if (r.lines && r.lines.length) A(body, h('div', { class: 'card flush' }, r.lines.map((l) => h('div', { class: 'row' }, h('div', { class: 'cat' }, EMOJI[l.cat] || '🛒'),
      h('div', { class: 'grow' }, h('div', { class: 't' }, l.name), h('div', { class: 's' }, (l.qty !== 1 ? l.qty + ' × ' : '') + l.cat)), h('div', { class: 'amt' }, E.money(l.total))))));
    const ph = h('div'); A(body, ph);
    (r.photoIds || []).forEach(async (pid) => { const b = await S.getPhoto(pid); if (b) ph.append(h('img', { class: 'photo', alt: 'Receipt photo', src: URL.createObjectURL(b) })); });
    A(body, h('div', { class: 'actions' }, h('button', { class: 'danger', onclick: () => { if (confirm('Delete this shop?')) { S.removeReceipt(id); close(); render(); toast('Shop deleted'); } } }, 'Delete this shop')));
    return body;
  });
  return sh;
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
  const due = E.dueList(rs, t), soon = E.dueList(rs, t + 7).filter((d) => !due.some((x) => x.id === d.id));
  const ticks = st.ticks || (st.ticks = {});
  const key = (d) => d.id + ':' + d.lastDay;
  const totalEl = h('div', { class: 'big', style: 'font-size:34px' });
  const subEl = h('div', { class: 'sub' });
  const upd = () => { const open = due.filter((d) => !ticks[key(d)]); countTo(totalEl, E.dueTotal(open)); subEl.textContent = `${plural(open.length, 'item', 'items')} left, at what you paid last time`; };
  A(wrap, h('div', { class: 'hero rise' }, h('div', { class: 'lab' }, 'Next shop, if you buy the usual'), totalEl, subEl));
  upd();
  if (!due.length) A(wrap, h('div', { class: 'card empty' }, emptyArt(), h('h3', null, 'Nothing due right now'), h('p', null, soon.length ? 'Your usual items are all within their gap. See what is coming up below.' : 'Your usual items are all within their gap.')));
  else {
    const list = h('div', { class: 'card flush' });
    due.forEach((d, i) => {
      const row = h('div', { class: 'row rise', style: `animation-delay:${Math.min(i, 10) * 25}ms` });
      const tick = h('button', { class: 'tick', role: 'checkbox', 'aria-checked': !!ticks[key(d)], 'aria-label': 'Got ' + d.name, onclick: () => { ticks[key(d)] = !ticks[key(d)]; if (!ticks[key(d)]) delete ticks[key(d)]; S.save(); tick.setAttribute('aria-checked', !!ticks[key(d)]); row.classList.toggle('done', !!ticks[key(d)]); tick.textContent = ticks[key(d)] ? '✓' : ''; upd(); } }, ticks[key(d)] ? '✓' : '');
      if (ticks[key(d)]) row.classList.add('done');
      row.append(tick, h('div', { class: 'cat' }, EMOJI[d.cat] || '🛒'),
        h('div', { class: 'grow' }, h('div', { class: 't' }, d.name), h('div', { class: 's' }, `Last ${E.fmtShort(d.lastDay)} · usually every ${d.interval} days`)),
        h('div', { style: 'text-align:right' }, h('div', { class: 'amt' }, E.money(d.lastPaid)), h('div', { class: 'tag ' + (d.over > 0 ? 'amber' : 'meta') }, d.over > 0 ? `${d.over}d over` : d.over === 0 ? 'due today' : `in ${-d.over}d`)));
      list.append(row);
    });
    A(wrap, list);
    const text = () => 'Shopping list\n' + due.filter((d) => !ticks[key(d)]).map((d) => '- ' + d.name).join('\n');
    A(wrap, h('div', { class: 'actions' },
      h('button', { onclick: async () => { try { await navigator.clipboard.writeText(text()); toast('List copied'); } catch { toast('Could not copy'); } } }, 'Copy list'),
      navigator.share ? h('button', { onclick: () => navigator.share({ text: text() }).catch(() => {}) }, 'Share list') : null));
  }
  if (soon.length) A(wrap, h('h2', null, 'Coming up this week'), h('div', { class: 'card flush' }, soon.map((d) => h('div', { class: 'row' }, h('div', { class: 'cat' }, EMOJI[d.cat] || '🛒'),
    h('div', { class: 'grow' }, h('div', { class: 't' }, d.name), h('div', { class: 's' }, `Usually every ${d.interval} days`)), h('div', { class: 'tag meta' }, `in ${d.interval - (t - d.lastDay)}d`)))));
  A(wrap, h('p', { class: 'meta small', style: 'margin-top:8px' }, 'Your usual items are the ones you buy at a steady gap, 3 or more times. This is your own history, not a recommendation.'));
  return wrap;
}

// ---------- ADD ----------
let addDraft = null;
function newDraft() { return { store: '', day: today(), total: '', mode: 'total', lines: [], gst: '', count: '', barcode: null, photos: [], t0: null, dayTouched: false, dupOk: false }; }
function addScreen() {
  const st = S.get();
  const d = addDraft || (addDraft = newDraft());
  const wrap = h('div');
  A(wrap, h('div', { class: 'head' }, h('h1', null, 'Add a shop')));
  const touch = () => { if (!d.t0) d.t0 = performance.now(); };

  // photo + barcode
  const info = h('div'), thumbs = h('div', { class: 'thumbs' });
  const file = h('input', { type: 'file', accept: 'image/*', class: 'hide', id: 'photo', onchange: async (e) => {
    const f = e.target.files[0]; if (!f) return; touch(); info.replaceChildren(h('p', { class: 'meta small' }, 'Reading the barcode on this device…'));
    try {
      const bc = await readReceiptBarcode(f);
      d.photos.push(await S.shrink(f));
      thumbs.append(h('img', { alt: 'Receipt photo', src: URL.createObjectURL(d.photos[d.photos.length - 1]) }));
      if (bc && bc.raw && !d.barcode) {
        d.barcode = bc; if (bc.day && !d.dayTouched) { d.day = bc.day; dateEl.value = E.isoFromDay(bc.day); }
        info.replaceChildren(h('div', { class: 'check ok' }, '✓ Barcode read. ', bc.day ? `Dated ${E.fmtDay(bc.day)}, till ${bc.till}, transaction ${bc.txn}.` : `Till ${bc.till}, transaction ${bc.txn}.`));
      } else if (bc && bc.raw) info.replaceChildren(h('div', { class: 'check' }, 'Another photo added to the same receipt.'));
      else info.replaceChildren(h('div', { class: 'check warn' }, 'No barcode found in that photo. You can still type the shop in. For a long receipt, add the other photo too.'));
    } catch (err) { info.replaceChildren(h('div', { class: 'check warn' }, 'Could not use that photo.')); }
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
  const lineBox = h('div'), seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'How much detail' });
  const segBtns = [['total', 'Total only'], ['lines', 'Add the lines']].map(([m, l]) => h('button', { 'aria-pressed': d.mode === m, onclick: () => { d.mode = m; if (m === 'lines' && !d.lines.length) addLine(); segBtns.forEach((b, i) => b.setAttribute('aria-pressed', ['total', 'lines'][i] === m)); drawLines(); refresh(); } }, l));
  seg.append(...segBtns);
  A(wrap, seg, h('p', { class: 'meta small', style: 'margin:6px 2px 12px' }, 'Total only takes seconds and feeds your spend and rhythm. Lines also feed your usual list and price moves.'), lineBox);

  const known = () => knownItems(st.receipts).concat(d.lines.filter((l) => l.item && l.name).map((l) => ({ item: l.item, name: l.name, cat: l.cat })));
  function addLine() { d.lines.push({ name: '', qty: '', total: '', item: '', cat: 'Other', sug: null }); }
  function drawLines() {
    lineBox.replaceChildren(); if (d.mode !== 'lines') return;
    const box = h('div', { class: 'lines' });
    d.lines.forEach((l, i) => {
      const catBtn = h('button', { class: 'chip', style: 'min-height:30px;padding:3px 10px', onclick: () => { l.cat = E.CATS[(E.CATS.indexOf(l.cat) + 1) % E.CATS.length]; l.catSet = true; draw(); } });
      const sugEl = h('div', { class: 'sug' });
      const draw = () => { catBtn.textContent = (EMOJI[l.cat] || '🛒') + ' ' + l.cat; sugEl.replaceChildren(catBtn); if (l.sug) sugEl.append(' ', h('span', { class: 'meta' }, 'Same as ' + l.sug.name + '? '), h('button', { onclick: () => { l.item = l.sug.item; l.name = l.sug.name; l.cat = l.sug.cat; l.sug = null; drawLines(); refresh(); } }, 'Yes')); };
      const nameEl = h('input', { 'aria-label': 'Item', placeholder: 'Item', value: l.name, autocomplete: 'off', oninput: (e) => {
        touch(); l.name = e.target.value; l.item = E.itemKey(l.name);
        if (!l.catSet) l.cat = E.guessCategory(l.name);
        const s = E.suggestItem(l.name, known().filter((k) => k.item !== l.item && !(d.lines.indexOf(l) >= 0 && k.item === l.item)));
        l.sug = s && s.item !== l.item ? s : null; draw(); refresh(); } });
      box.append(h('div', { class: 'ln' }, nameEl,
        h('input', { 'aria-label': 'Quantity', inputmode: 'decimal', placeholder: 'Qty', value: l.qty, oninput: (e) => { touch(); l.qty = e.target.value; refresh(); } }),
        h('input', { 'aria-label': 'Line total', inputmode: 'decimal', placeholder: '0.00', value: l.total, oninput: (e) => { touch(); l.total = e.target.value; refresh(); } }),
        h('button', { class: 'x ghost', 'aria-label': 'Remove line', onclick: () => { d.lines.splice(i, 1); drawLines(); refresh(); } }, '✕'), sugEl));
      draw();
    });
    lineBox.append(h('div', { class: 'card' }, box, h('div', { class: 'actions' }, h('button', { onclick: () => { addLine(); drawLines(); box.parentElement.querySelector('.ln:last-of-type input')?.focus(); } }, '+ Add a line'))),
      h('details', { class: 'card' }, h('summary', { style: 'cursor:pointer;font-weight:600' }, 'Extra checks from the receipt (optional)'),
        h('div', { class: 'two' }, h('div', null, h('label', null, 'GST printed'), h('input', { inputmode: 'decimal', placeholder: '0.00', value: d.gst, oninput: (e) => { d.gst = e.target.value; refresh(); } })),
          h('div', null, h('label', null, 'Item count printed'), h('input', { inputmode: 'numeric', placeholder: 'e.g. 10', value: d.count, oninput: (e) => { d.count = e.target.value; refresh(); } })))));
  }
  drawLines();

  // check + save
  const checkBox = h('div'), saveRow = h('div', { class: 'actions' });
  A(wrap, checkBox, saveRow);
  function parsed() {
    const total = E.parseMoney(d.total);
    const lines = d.lines.filter((l) => l.name.trim() || l.total.trim()).map((l) => {
      const qty = E.parseQty(l.qty), tot = E.parseMoney(l.total);
      return { name: l.name.trim(), item: l.item || E.itemKey(l.name), cat: l.cat, qty, total: tot, unit: qty && tot != null ? Math.round(tot / qty) : null, raw: l };
    });
    return { total, lines, bad: lines.some((l) => !l.name || l.qty == null || l.total == null) };
  }
  function build() {
    const p = parsed();
    const r = { id: S.uid(), store: d.store.trim() || 'Shop', day: d.day, total: p.total, mode: d.mode === 'lines' ? 'lines' : 'total', source: 'typed', lines: d.mode === 'lines' ? p.lines.map(({ name, item, cat, qty, unit, total }) => ({ name, item, cat, qty, unit, total })) : [] };
    if (d.barcode && d.barcode.raw) r.barcode = d.barcode.raw;
    return r;
  }
  function refresh() {
    const p = parsed(), cs = [], items = [];
    let canSave = p.total != null && p.total > 0, label = 'Save shop', saveTotalOnly = false;
    if (p.total == null && d.total) cs.push(['bad', '✕ The till total is not an amount.']);
    if (d.mode === 'lines') {
      if (p.bad) { cs.push(['warn', 'Each line needs an item, a quantity (or leave it empty for 1) and a total.']); canSave = false; }
      else if (p.lines.length && p.total != null) {
        const rc = E.reconcile(p.lines.map((l) => ({ qty: l.qty, unit: l.unit, total: l.total })), p.total);
        if (rc.reconciled) cs.push(['ok', `✓ Lines add up to ${E.money(rc.linesTotal)}. Matches the till total.`]);
        else { cs.push(['bad', `✕ Lines add up to ${E.money(rc.linesTotal)}. The till total is ${E.money(p.total)}. Difference ${E.money(Math.abs(rc.difference))}. Check the lines.`]); canSave = false; saveTotalOnly = true; }
        const g = E.checkGst(p.total, E.parseMoney(d.gst)); if (g) cs.push([g.ok ? 'ok' : 'warn', g.ok ? '✓ GST matches the total.' : `GST should be about ${E.money(g.expected)} for this total. Check the total.`]);
        const ic = E.checkItemCount(p.lines.map((l) => ({ qty: l.qty })), d.count ? parseInt(d.count, 10) : null); if (ic) cs.push([ic.ok ? 'ok' : 'warn', ic.ok ? '✓ Item count matches.' : `You have ${ic.counted} items. The receipt says ${ic.printed}.`]);
      } else if (!p.lines.length) canSave = false;
    }
    if (d.barcode && d.barcode.day && d.barcode.day !== d.day) cs.push(['warn', `The barcode says ${E.fmtDay(d.barcode.day)}. The date above is ${E.fmtDay(d.day)}.`]);
    let dup = null;
    if (p.total != null) { dup = E.findDuplicate(st.receipts, { id: '_', store: d.store.trim() || 'Shop', day: d.day, total: p.total, barcode: d.barcode && d.barcode.raw }); }
    if (dup) { cs.push(['warn', `Looks like a shop you already added: ${dup.store}, ${E.fmtDay(dup.day)}, ${E.money(dup.total)}.`]); label = 'Save anyway'; }
    checkBox.replaceChildren(...cs.map(([k, m]) => h('div', { class: 'check ' + k, role: k === 'bad' ? 'alert' : null }, m)));
    saveRow.replaceChildren(...[h('button', { class: 'fill', disabled: !canSave, onclick: () => doSave(build(), false) }, label),
      saveTotalOnly && p.total ? h('button', { onclick: () => doSave({ ...build(), mode: 'total', lines: [] }, true) }, 'Save the total only') : null].filter(Boolean));
  }
  async function doSave(r, totalOnly) {
    const sec = d.t0 ? (performance.now() - d.t0) / 1000 : 0;
    try {
      r.photoIds = []; for (const b of d.photos) { const pid = S.uid('p'); await S.putPhoto(pid, b); r.photoIds.push(pid); }
    } catch { r.photoIds = []; }
    S.addReceipt(r); if (sec) S.logEntrySeconds(sec); S.save();
    addDraft = null; toast(totalOnly ? 'Saved the total' : 'Shop saved'); location.hash = '#spend'; go();
  }
  refresh();

  A(wrap, h('div', { class: 'card lock', style: 'margin-top:16px' }, h('div', { class: 'ic' }, '🔒'),
    h('div', null, h('h3', null, 'Read a receipt for me'), h('div', { class: 'meta small' }, 'Photo in, lines out, checked against the total. Home and Plus plans. Not in this version.'))));
  return wrap;
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
    return h('div', { class: 'row', role: 'button', tabindex: 0, onclick: () => couponView(c.id), onkeydown: (e) => { if (e.key === 'Enter') couponView(c.id); } },
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
function moreScreen() {
  const st = S.get(), wrap = h('div');
  A(wrap, h('div', { class: 'head' }, h('h1', null, 'More')));
  const bud = h('input', { id: 'mb', inputmode: 'decimal', value: st.budget ? (st.budget / 100).toString() : '', placeholder: 'Not set' });
  A(wrap, h('div', { class: 'card' }, h('label', { for: 'mb', style: 'margin-top:0' }, 'Monthly grocery budget'), bud,
    h('div', { class: 'actions' }, h('button', { onclick: () => { const b = E.parseMoney(bud.value); st.budget = b && b > 0 ? b : 0; S.save(); toast('Budget saved'); } }, 'Save budget'))));

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
    h('p', { class: 'meta' }, 'Everything lives on this device. A backup is one file with your shops, coupons and photos.'),
    h('div', { class: 'actions' },
      h('button', { onclick: async () => { const blob = new Blob([await S.exportAll()], { type: 'application/json' }); const a = h('a', { href: URL.createObjectURL(blob), download: `hosti-home-backup-${E.isoFromDay(today())}.json` }); document.body.append(a); a.click(); a.remove(); toast('Backup saved'); } }, 'Back up'),
      h('label', { for: 'rest', class: 'btn', role: 'button', style: 'margin:0;color:var(--ink);font-size:16px' }, 'Restore')), file,
    h('div', { class: 'actions' }, h('button', { class: 'danger', onclick: eraseFlow }, 'Erase everything'))));

  A(wrap, h('h2', null, 'What the paid plans add'), h('div', { class: 'card flush' }, [
    ['Read a receipt for me', 'Photo in, lines out, checked against the total'],
    ['Pantry and fridge check', 'A photo to confirm what is low before you shop'],
    ['Shared household', 'Up to 5 people on one list'],
    ['Bank totals', 'Spot shops nobody added. Totals only.'],
  ].map(([a, b]) => h('div', { class: 'row lock' }, h('div', { class: 'ic' }, '🔒'), h('div', { class: 'grow' }, h('div', { class: 't' }, a), h('div', { class: 's' }, b))))),
    h('p', { class: 'meta small' }, 'Typing your shops in is free. The paid plans read them for you. Not in this version.'));

  A(wrap, h('h2', null, 'Install'), h('div', { class: 'card' }, h('p', { class: 'meta' }, 'Add this to your home screen so it opens like an app and works offline. On iPhone, tap Share then Add to Home Screen. On Android, open the browser menu then Install app.')));
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
