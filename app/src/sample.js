// Sample household for trying the app. Invented numbers, generic store names. Every sample receipt carries sample:true
// so it can be removed in one tap. Dates are relative to today so the sample always looks current.
import { dayNum, parts, itemKey } from './engine.js';

// [name, category, usual gap in days, price in cents, options]
const ROWS = [
  ["Milk 2L", "Dairy & eggs", 4, 460, {"qty": 2}],
  ["Eggs 12 pack", "Dairy & eggs", 9, 820, {"stepAgo": 17, "stepTo": 860}],
  ["Butter 500g", "Dairy & eggs", 21, 700, {"stepAgo": 38, "stepTo": 760}],
  ["Yoghurt 1kg", "Dairy & eggs", 8, 590],
  ["Cheese 1kg", "Dairy & eggs", 14, 1250, {"stepAgo": 28, "stepTo": 1320}],
  ["Bread loaf", "Bakery", 4, 360, {"qty": 2}],
  ["Wraps 8 pack", "Bakery", 14, 520],
  ["Bananas (per kg)", "Fruit & veg", 6, 399, {"kg": 1}],
  ["Apples 1.5kg", "Fruit & veg", 8, 650],
  ["Potatoes 2kg", "Fruit & veg", 10, 580],
  ["Carrots 1.5kg", "Fruit & veg", 10, 340],
  ["Onions 1.5kg", "Fruit & veg", 14, 420],
  ["Tomatoes (per kg)", "Fruit & veg", 7, 790, {"kg": 1}],
  ["Salad bag", "Fruit & veg", 7, 450],
  ["Chicken thighs 1kg", "Meat & fish", 7, 1290, {"qty": 2, "stepAgo": 10, "stepTo": 1350}],
  ["Beef mince 500g", "Meat & fish", 10, 980],
  ["Sausages 8 pack", "Meat & fish", 14, 860],
  ["Bacon 250g", "Meat & fish", 14, 890],
  ["Rice 5kg", "Pantry", 45, 1450],
  ["Pasta 500g", "Pantry", 16, 230],
  ["Tinned tomatoes 400g x2", "Pantry", 14, 190, {"qty": 2}],
  ["Cooking oil 1L", "Pantry", 50, 990],
  ["Ground coffee 200g", "Pantry", 21, 1150, {"stepAgo": 64, "stepTo": 1250}],
  ["Cereal 700g", "Pantry", 12, 660],
  ["Peanut butter 380g", "Pantry", 35, 580],
  ["Frozen veg 1kg", "Frozen", 14, 480],
  ["Ice cream 2L", "Frozen", 16, 720],
  ["Juice 2L", "Drinks", 9, 440],
  ["Tea bags 100", "Drinks", 35, 610],
  ["Toilet paper 12 pack", "Household", 21, 1290],
  ["Dishwasher tabs 40", "Household", 35, 1400],
  ["Laundry liquid 2L", "Household", 42, 1750],
  ["Rubbish bags 30", "Household", 40, 750],
  ["Broccoli head", "Fruit & veg", 7, 450],
  ["Mandarins 1.5kg", "Fruit & veg", 10, 590],
  ["Cucumber", "Fruit & veg", 7, 220],
  ["Avocados 3 pack", "Fruit & veg", 10, 850],
  ["Berries 400g", "Fruit & veg", 10, 680],
  ["Sliced ham 400g", "Meat & fish", 7, 890],
  ["Fish fillets 500g", "Meat & fish", 14, 1250],
  ["Pork chops 700g", "Meat & fish", 14, 1190],
  ["Pasta sauce 500g", "Pantry", 14, 420, {"qty": 2}],
  ["Tuna 4 pack", "Pantry", 16, 1090],
  ["Crackers 250g", "Pantry", 14, 520],
  ["Muesli bars 12 pack", "Pantry", 12, 750],
  ["Rolled oats 1kg", "Pantry", 28, 520],
  ["Flour 1.5kg", "Pantry", 40, 380],
  ["Baked beans 420g", "Pantry", 14, 260, {"qty": 2}],
  ["Frozen pizza 2 pack", "Frozen", 14, 1080],
  ["Sparkling water 12 pack", "Drinks", 14, 1150],
  ["Paper towels 6 pack", "Household", 30, 1150],
  ["Dishwashing liquid 500ml", "Household", 30, 450],
  ["Hand wash 500ml", "Household", 30, 520],
  ["Toothpaste 110g", "Household", 45, 480],
  ["Chocolate block 200g", "Snacks & treats", 0, 450, {"extra": 1}],
  ["Chips 175g", "Snacks & treats", 0, 320, {"extra": 1}],
  ["Biscuits 200g", "Snacks & treats", 0, 380, {"extra": 1}],
  ["Soft drink 1.5L", "Snacks & treats", 0, 320, {"extra": 1}],
  ["Ice blocks 10 pack", "Snacks & treats", 0, 590, {"extra": 1}],
];
const EXTRAS = ROWS.filter((r) => r[4] && r[4].extra);
const REGULAR = ROWS.filter((r) => !(r[4] && r[4].extra));

function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pickW(R, list) { let r = R(), a = 0; for (const [v, w] of list) { a += w; if (r < a) return v; } return list[list.length - 1][0]; }

function line(row, day, today, R) {
  const [name, cat, , price, o = {}] = row;
  let unit = price;
  if (o.stepAgo != null && day >= today - o.stepAgo) unit = o.stepTo;
  let qty = 1;
  if (o.kg) qty = Math.round((0.5 + R() * 0.6) * 100) / 100; else if (o.qty) qty = o.qty;
  return { item: itemKey(name), name, cat, qty, unit, total: Math.round(qty * unit) };
}

// Shops on Saturdays (main) and some Wednesdays (top-up), for about 16 weeks, ending on the last of those days before today.
export function sampleReceipts(today, weeks = 16) {
  const R = rng(20261018);
  let end = today - 3;
  while (![3, 6].includes(parts(end).dow)) end--;
  const start = end - weeks * 7;
  const last = {}; REGULAR.forEach((r) => (last[r[0]] = start - Math.floor(R() * r[2])));
  const out = []; let n = 1;
  for (let day = start; day <= end; day++) {
    const dow = parts(day).dow, main = dow === 6, top = dow === 3;
    if (!main && !top) continue;
    if (top && day !== end && R() < 0.25) continue;
    const store = pickW(R, main ? [['Supermarket A', 0.55], ['Supermarket B', 0.25], ['Supermarket C', 0.2]] : [['Supermarket B', 0.5], ['Supermarket C', 0.3], ['Supermarket A', 0.2]]);
    const lines = [];
    for (const row of REGULAR) {
      const since = day - last[row[0]];
      const buy = main ? since >= row[2] * (0.8 + R() * 0.3) : row[2] <= 10 && since >= row[2] * 0.95 && R() < 0.85 && lines.length < 6;
      if (buy) { lines.push(line(row, day, today, R)); last[row[0]] = day; }
    }
    const ne = main ? (R() < 0.5 ? 1 : R() < 0.4 ? 2 : 0) : (R() < 0.15 ? 1 : 0);
    for (let k = 0; k < ne; k++) {
      const row = EXTRAS[Math.floor(R() * EXTRAS.length)];
      if (!lines.some((l) => l.name === row[0])) lines.push(line(row, day, today, R));
    }
    if (!lines.length) continue;
    out.push({ id: 'sample' + n++, sample: true, store, day, mode: 'lines', source: 'typed', lines, total: lines.reduce((s, l) => s + l.total, 0) });
  }
  return out;
}
