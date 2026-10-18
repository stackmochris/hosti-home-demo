// Barcode reading, on this device. BarcodeDetector where the browser has it, zxing (wasm) everywhere else.
import { parseBarcode } from './engine.js';

let zx = null;
async function zxing() {
  if (zx) return zx;
  const mod = await import('../vendor/zxing-reader.js');
  const url = new URL('../vendor/zxing_reader.wasm', import.meta.url).href;
  const wasm = await (await fetch(url)).arrayBuffer();
  await mod.prepareZXingModule({ overrides: { wasmBinary: wasm }, fireImmediately: true });
  zx = mod; return zx;
}

async function toImageData(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0, c.width, c.height);
  return g.getImageData(0, 0, c.width, c.height);
}

// Returns {raw, ...parsed} for the first 20-digit code found, or {text} for any other code, or null.
export async function readReceiptBarcode(file) {
  let texts = [];
  try {
    if ('BarcodeDetector' in window) {
      const bmp = await createImageBitmap(file);
      const found = await new BarcodeDetector({ formats: ['code_128', 'ean_13', 'itf', 'code_39', 'qr_code'] }).detect(bmp);
      texts = found.map((f) => f.rawValue);
    }
  } catch { /* fall through to wasm */ }
  if (!texts.length) {
    try {
      const m = await zxing();
      const res = await m.readBarcodes(await toImageData(file), { tryHarder: true });
      texts = res.map((r) => r.text);
    } catch (e) { console.warn('barcode read failed', e && e.message); }
  }
  for (const t of texts) { const p = parseBarcode(t); if (p) return p; }
  return texts.length ? { text: texts[0] } : null;
}
