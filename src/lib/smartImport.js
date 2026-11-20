// Smart reading of a supplier Excel: Claude reads every tab (even when the
// columns are shifted or broken) and the product photos, and matches each
// product row to one of Zenora's open order items.
import { fullSize, platingLabel } from './parse.js';
import { fmtDate } from './status.js';

export function candidateLines(s, poId = null) {
  const lines = Object.values(s.lines).filter((l) =>
    poId ? l.poId === poId : ['new', 'ordered', 'shipped'].includes(l.status));
  return lines
    .sort((a, b) => (s.orders[a.orderId]?.createdAt || '').localeCompare(s.orders[b.orderId]?.createdAt || '') || a.id.localeCompare(b.id))
    .map((l, i) => ({ key: `L${i + 1}`, line: l }));
}

function candidateText(s, cands) {
  return cands.map(({ key, line: l }) => {
    const o = s.orders[l.orderId];
    const po = l.poId ? s.pos[l.poId]?.number : 'no PO yet';
    return `${key} | order ${l.orderName}${o?.createdAt ? ` (${fmtDate(o.createdAt)})` : ''} | ${l.item} | ${l.category} | ${platingLabel(l.plating)} | ${fullSize(l) || 'no size'} | qty ${l.qty} | ${po}${l.price != null ? ` | priced $${l.price}` : ''}`;
  }).join('\n');
}

function buildPrompt(s, cands, sheets, images) {
  const sheetText = sheets.map((sh) => `=== TAB "${sh.name}" ===\n${sh.rows.map((r) => `row ${r.r}: ${r.text}`).join('\n')}`).join('\n\n');
  const imageText = images.length
    ? images.map((im, i) => `Photo ${i + 1} = tab "${im.sheet}" cell ${im.cell} (row ${im.row})`).join('\n')
    : 'No photos attached.';
  return `You are helping a jewelry brand (Zenora) read an Excel file sent by its supplier in China (a proforma invoice / price list).
The file may be messy: columns shifted, headers missing or in the wrong place, merged cells, several tabs, notes in random cells.
A product row usually has: Ser No., a picture, material (silver 925), plating ("gold", "silver" = white gold, "rose" = rose gold), unit price in USD, QTY, amount, and size (carat like "2ct"; ring size like "size 7", "s7", "#7", "7#"; length like "45cm" or "16cm").
Some rows may be marked as ALREADY SHIPPED: a column/note like "shipped", "sent", "已发", "已发货", "ok", a tick, a coloured fill, strikethrough, a date, or a separate tab for shipped items. Decide per row.
Cell notation below: A5=value means column A row 5. [fill ...] = cell colour, [strikethrough] = crossed out.

THE EXCEL:
${sheetText}

PRODUCT PHOTOS (attached images, in this order):
${imageText}

ZENORA'S OPEN ORDER ITEMS (match against these keys):
${cands.length ? candidateText(s, cands) : '(none)'}

TASK
1. Find every product row in the Excel (ignore headers, totals, bank details, notes).
2. For each, read: tab, row, ser no, what the product is (use the photo in that row: ring / earrings / bracelet / necklace / pendant / set, and its style), plating, carat, size, qty, unit price, and whether it is marked shipped.
3. Match it to the ONE best Zenora item key, using product type and style from the photo, plating, carat, size and qty. Use each key at most once. If nothing fits well, use null. Never guess wildly: low confidence is fine, a wrong high-confidence match is not.
4. Find the shipping / DHL / freight cost if the file has one.

Reply with ONLY this JSON (no other text):
{"rows":[{"sheet":"Sheet1","row":5,"ser":"1","what":"gold marquise ring","plating":"gold","carat":"","size":"size 10","qty":1,"price":53,"shipped":false,"match":"L12","confidence":"high","why":"gold ring, size 10, marquise like #1496"}],"shipping":65,"notes":"anything Lior should know, short"}
plating must be one of "gold", "silver", "rose" or "" if unknown. price and qty are numbers (null if missing). confidence is "high", "medium" or "low".`;
}

// Split rows into batches so each call stays within the image limit.
function batches(sheets, images, maxImages) {
  if (images.length <= maxImages) return [{ sheets, images }];
  const out = [];
  let cur = [];
  for (let i = 0; i < images.length; i += maxImages) cur.push(images.slice(i, i + maxImages));
  for (const imgs of cur) {
    const first = imgs[0]; const last = imgs[imgs.length - 1];
    const part = sheets.map((sh) => ({
      name: sh.name,
      rows: sh.rows.filter((r) => {
        if (sh.name !== first.sheet && sh.name !== last.sheet) return !images.some((im) => im.sheet === sh.name);
        const lo = sh.name === first.sheet ? first.row - 1 : 0;
        const hi = sh.name === last.sheet ? last.row + 1 : Infinity;
        return r.r >= lo && r.r <= hi;
      }),
    })).filter((sh) => sh.rows.length);
    out.push({ sheets: part, images: imgs });
  }
  return out;
}

export async function smartRead({ s, sampler, workbook, poId = null, onProgress }) {
  const cands = candidateLines(s, poId);
  const limits = await sampler.limits().catch(() => ({}));
  const maxImages = limits?.images?.maxCount || 0;
  const useImages = maxImages > 0 ? workbook.images : [];
  const parts = batches(workbook.sheets, useImages, Math.max(1, maxImages || 1));
  const rows = []; let shipping = null; const notes = [];
  for (let i = 0; i < parts.length; i++) {
    onProgress?.(parts.length > 1 ? `Reading part ${i + 1} of ${parts.length}…` : 'Reading the file…');
    const p = parts[i];
    const opts = { modelTier: 'default' };
    if (p.images.length) opts.images = p.images.map((im) => im.blob);
    const res = await sampler.json(buildPrompt(s, cands, p.sheets, p.images), opts);
    (res?.rows || []).forEach((r) => rows.push(r));
    if (res?.shipping != null && shipping == null) shipping = Number(res.shipping) || null;
    if (res?.notes) notes.push(String(res.notes));
  }
  // de-duplicate rows read twice at batch edges
  const seen = new Set();
  const unique = rows.filter((r) => { const k = `${r.sheet}|${r.row}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const byKey = Object.fromEntries(cands.map((c) => [c.key, c.line.id]));
  const used = new Set();
  const result = unique.map((r, i) => {
    let lineId = r.match && byKey[r.match] ? byKey[r.match] : null;
    if (lineId && used.has(lineId)) lineId = null;
    if (lineId) used.add(lineId);
    const img = workbook.images.filter((im) => im.sheet === r.sheet && Math.abs(im.row - Number(r.row)) <= 1)
      .sort((x, y) => Math.abs(x.row - Number(r.row)) - Math.abs(y.row - Number(r.row)))[0];
    return {
      id: `r${i}`, sheet: r.sheet, row: Number(r.row) || null, ser: r.ser ?? '', what: r.what || '',
      plating: ['gold', 'silver', 'rose'].includes(r.plating) ? r.plating : '', carat: r.carat || '', size: r.size || '',
      qty: Number(r.qty) || 1, price: r.price == null || r.price === '' ? null : Number(r.price), shipped: !!r.shipped,
      lineId, confidence: lineId ? (r.confidence || 'low') : null, why: r.why || '', image: img?.dataUrl || null, use: true,
    };
  });
  return { rows: result, shipping, notes: notes.join(' '), candidates: cands };
}
