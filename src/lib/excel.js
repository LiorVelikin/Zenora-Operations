import { fullSize, caratText } from './parse.js';
import { linesOfPO, poRows } from './store.js';
import { PLATINGS } from './parse.js';
import { saveFile, imageAsBase64 } from './platform.js';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';

// ExcelJS writes every photo with a 0×0 size inside the drawing. Excel ignores that and uses the
// cell corners, but iPhone / WhatsApp previews use it, so the photos look empty there.
// Write the real position and size of each photo (in EMU) into the file.
function fixPhotoSizes(bytes, rowsWithPhoto, { colA, colB, top, rowH }) {
  if (!rowsWithPhoto.length) return bytes;
  const files = unzipSync(bytes);
  const name = Object.keys(files).find((f) => /^xl\/drawings\/drawing\d+\.xml$/.test(f));
  if (!name) return bytes;
  const px = (w) => Math.trunc(w * 7 + 5); // Excel column width (characters) → pixels
  const EMU_PX = 9525, EMU_PT = 12700;
  const topPt = top.reduce((a, b) => a + b, 0);
  let i = 0;
  const xml = strFromU8(files[name]).replace(/<a:off x="0" y="0"\/><a:ext cx="0" cy="0"\/>/g, (m) => {
    const n = rowsWithPhoto[i++];
    if (n == null) return m;
    const x = px(colA) * EMU_PX, y = Math.round((topPt + (n - 4) * rowH) * EMU_PT);
    return `<a:off x="${x}" y="${y}"/><a:ext cx="${px(colB) * EMU_PX}" cy="${Math.round(rowH * EMU_PT)}"/>`;
  });
  files[name] = strToU8(xml);
  return zipSync(files, { level: 6 });
}

const loadExcel = async () => (await import('exceljs/dist/exceljs.min.js')).default;
const supplierPlating = (id) => PLATINGS.find((p) => p.id === id)?.supplier || '';

const SHIPPED = ['shipped', 'arrived', 'done'];
export function rowShipped(r) { return r.lines.filter((l) => SHIPPED.includes(l.status)).reduce((t, l) => t + (l.qty || 1), 0); }
function rowLastShipDate(s, r) {
  const d = r.lines.map((l) => l.shipmentId && s.shipments[l.shipmentId]?.shippedAt).filter(Boolean).sort().pop();
  return d ? new Date(d) : null;
}

// Simple sheet in the supplier's own style: photo, item, plating, size, quantity, her price.
// Code (hidden column) lets the system read her filled file back. Gifts look like any other item.
const PLATING_FILL = { gold: 'FFE9C75F', rose: 'FFF1B9B0' };
export async function exportPOExcel(s, poId) {
  const ExcelJS = await loadExcel();
  const po = s.pos[poId];
  const rows = poRows(s, poId);
  const hasNotes = rows.some((r) => r.supplierNote);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Lior';
  const ws = wb.addWorksheet(po.number);
  // A Ser No. | B Picture | C Item | D Plating | E Size | F QTY | G Price | H Amount | I Shipped date | J Note | K Code (hidden)
  const head = ['Ser No.', 'Picture', 'Item', 'Plating', 'Size', 'QTY', 'Price (USD)', 'Amount (USD)', 'Shipped date', 'Note', 'Code'];
  ws.columns = [{ width: 8 }, { width: 15 }, { width: 28 }, { width: 10 }, { width: 14 }, { width: 7 }, { width: 12 }, { width: 15 }, { width: 13 }, { width: hasNotes ? 26 : 2 }, { width: 10 }];
  if (!hasNotes) ws.getColumn(10).hidden = true;
  ws.getColumn(11).hidden = true;

  ws.mergeCells('A1:G1');
  ws.getCell('A1').value = `Lior ${po.number}`;
  ws.getRow(1).height = 24; ws.getRow(2).height = 8;
  ws.getCell('A1').font = { bold: true, size: 15 };
  ws.getCell('H1').value = new Date(po.sentAt || po.createdAt).toISOString().slice(0, 10).replace(/-/g, '/');
  ws.getCell('H1').font = { bold: true };

  const thin = { style: 'thin', color: { argb: 'FF9A9A9A' } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  const hr = ws.getRow(3);
  head.forEach((h, i) => {
    const c = hr.getCell(i + 1);
    c.value = h; c.font = { bold: true };
    c.border = box;
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  hr.height = 22;

  const images = await Promise.all(rows.map((r) => imageAsBase64(r.first.customImage || r.first.image || r.first.supplierImage, 240)));
  const placed = []; // [row number] of each photo, in the order they are added
  rows.forEach((r, i) => {
    const n = 4 + i;
    const row = ws.getRow(n);
    const shipped = rowShipped(r);
    const size = [caratText(r.carat), r.size].filter(Boolean).join(' ');
    const item = String(r.item || '').replace(/\s*\(GIFT\)/i, '');
    row.values = [r.serNo, '', item, supplierPlating(r.plating), size, r.qty, r.price ?? null, null, shipped ? rowLastShipDate(s, r) : null, r.supplierNote || '', r.ref];
    row.getCell(8).value = { formula: `IF(G${n}="","",F${n}*G${n})` };
    row.height = 82;
    for (let col = 1; col <= 11; col++) {
      const c = row.getCell(col);
      c.border = box;
      c.alignment = { vertical: 'middle', horizontal: [3, 10].includes(col) ? 'left' : 'center', wrapText: [3, 10].includes(col) };
    }
    const fill = PLATING_FILL[r.plating];
    if (fill) row.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    row.getCell(6).font = { bold: true, size: r.qty > 1 ? 14 : 11, color: { argb: r.qty > 1 ? 'FFB42318' : 'FF1A1A1A' } };
    row.getCell(7).numFmt = '"$"0.00'; row.getCell(8).numFmt = '"$"0.00';
    row.getCell(9).numFmt = 'yyyy/mm/dd';
    if (images[i]?.dataUrl) {
      const id = wb.addImage({ base64: images[i].dataUrl, extension: images[i].ext });
      // anchored to the cell's corners: shows in Excel, WPS, Numbers and phone previews
      ws.addImage(id, { tl: { col: 1, row: n - 1 }, br: { col: 2, row: n }, editAs: 'oneCell' });
      placed.push(n);
    }
  });
  const last = 3 + rows.length;
  const sumR = last + 1, dhlR = last + 2, totR = last + 3;
  ws.getCell(`G${sumR}`).value = 'Items';
  ws.getCell(`H${sumR}`).value = { formula: `SUM(H4:H${last})` };
  ws.getCell(`G${dhlR}`).value = 'DHL';
  ws.getCell(`H${dhlR}`).value = po.shipping ?? null;
  ws.getCell(`G${totR}`).value = 'TOTAL';
  ws.getCell(`H${totR}`).value = { formula: `H${sumR}+H${dhlR}` };
  [sumR, dhlR, totR].forEach((r) => {
    ['G', 'H'].forEach((c) => { ws.getCell(`${c}${r}`).font = { bold: true }; ws.getCell(`${c}${r}`).border = box; ws.getCell(`${c}${r}`).alignment = { horizontal: 'center' }; });
    ws.getCell(`H${r}`).numFmt = '"$"0.00';
  });

  const buf = fixPhotoSizes(new Uint8Array(await wb.xlsx.writeBuffer()), placed, { colA: 8, colB: 15, top: [24, 8, 22], rowH: 82 });
  await saveFile(`Lior ${po.number}.xlsx`, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const got = images.filter((x) => x?.dataUrl).length;
  return { photos: got, total: rows.length, error: images.find((x) => x?.error)?.error || null };
}

// "21/11", "21.11.2026", "2026-11-21", Excel date → 'YYYY-MM-DD'
export function parseShipDate(v) {
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  const t = String(v ?? '').trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?/);
  if (m) { const y = m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : String(new Date().getFullYear()); return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  return new Date().toISOString().slice(0, 10); // any mark ("ok", "✓") = shipped today
}

// ---------- import ----------
function cellVal(c) {
  let v = c?.value;
  if (v && typeof v === 'object') {
    if ('result' in v) v = v.result;
    else if (v.richText) v = v.richText.map((t) => t.text).join('');
    else if (v.text) v = v.text;
  }
  return v;
}
const num = (v) => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

// Reads back OUR exported file after the supplier filled the prices.
// rows = poRows(...) of that PO. Matches by Code, then by Ser No.
export async function readSupplierExcel(file, rows) {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  for (const ws of wb.worksheets) {
    let headRow = null; const cols = {};
    for (let r = 1; r <= Math.min(ws.rowCount, 40) && !headRow; r++) {
      ws.getRow(r).eachCell((c, col) => { if (/^ser\.?\s*no/i.test(String(cellVal(c) ?? '').trim())) { headRow = r; cols.ser = col; } });
    }
    if (!headRow) continue;
    ws.getRow(headRow).eachCell((c, col) => {
      const t = String(cellVal(c) ?? '').trim().toLowerCase();
      if (/^(unit\s*)?price/.test(t)) cols.price = col;
      else if (/^(code|ref|zenora ref)/.test(t)) cols.code = col;
      else if (/^shipped\s*date/.test(t)) cols.date = col;
      else if (/^qty\s*shipped/.test(t)) cols.qtyShipped = col;
    });
    if (!cols.price) throw new Error('Found the sheet but no "Price" column.');
    const ships = [];
    const byCode = new Map(rows.map((r) => [String(r.ref || '').toUpperCase(), r]));
    const bySer = new Map(rows.map((r) => [Number(r.serNo), r]));
    const matches = []; const problems = []; let usedCode = false; let shipping = null;
    for (let r = headRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      row.eachCell((c, col) => {
        if (/^(dhl|shipping|freight)/i.test(String(cellVal(c) ?? '').trim())) { const v = num(cellVal(row.getCell(col + 1))); if (v != null) shipping = v; }
      });
      const ser = num(cellVal(row.getCell(cols.ser)));
      if (ser == null) continue;
      const code = cols.code ? String(cellVal(row.getCell(cols.code)) ?? '').trim().toUpperCase() : '';
      let hit = code && byCode.get(code);
      if (hit) usedCode = true; else hit = bySer.get(ser);
      if (!hit) { problems.push(`Row ${r}: not on this PO`); continue; }
      if (cols.date) {
        const date = parseShipDate(cellVal(row.getCell(cols.date)));
        const qs = cols.qtyShipped ? num(cellVal(row.getCell(cols.qtyShipped))) : null;
        if (date || qs) {
          const total = Math.min(hit.qty, qs || hit.qty);
          const toShip = total - rowShipped(hit);
          if (toShip > 0) ships.push({ ids: hit.ids, serNo: hit.serNo, qty: toShip, date: date || new Date().toISOString().slice(0, 10), item: hit.item });
        }
      }
      const price = num(cellVal(row.getCell(cols.price)));
      if (price == null) continue;
      matches.push({ ids: hit.ids, serNo: hit.serNo, price });
    }
    const missing = rows.filter((x) => !matches.some((m) => m.serNo === x.serNo));
    if (missing.length && matches.length) problems.push(`No price for Ser No. ${missing.map((x) => x.serNo).join(', ')}`);
    return { matches, shipping, problems, ships, matchedBy: usedCode ? 'Code' : 'Ser No.' };
  }
  throw new Error('This is not a Zenora PO file (no "Ser No." header). Use the smart import instead.');
}

// ---------- smart reading: dump every tab + embedded photos for Claude ----------
const COLS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const colName = (n) => (n <= 26 ? COLS[n - 1] : COLS[Math.floor((n - 1) / 26) - 1] + COLS[(n - 1) % 26]);

async function shrinkImage(buffer, ext) {
  const type = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
  const blob = new Blob([buffer], { type });
  try {
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, 360 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * scale)); c.height = Math.max(1, Math.round(bmp.height * scale));
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bmp, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL('image/jpeg', 0.85);
    const out = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85));
    return { blob: out, dataUrl };
  } catch { return null; } // emf/wmf and other formats a browser can't draw
}

export async function readWorkbookForAI(file) {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const sheets = [];
  const images = [];
  for (const ws of wb.worksheets) {
    const rows = [];
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      if (rows.length >= 800) return;
      const cells = [];
      row.eachCell({ includeEmpty: false }, (c, col) => {
        let v = cellVal(c);
        if (v instanceof Date) v = v.toISOString().slice(0, 10);
        if (v == null || String(v).trim() === '') return;
        const fill = c.fill?.fgColor?.argb && c.fill.fgColor.argb !== 'FFFFFFFF' ? ` [fill ${c.fill.fgColor.argb}]` : '';
        const strike = c.font?.strike ? ' [strikethrough]' : '';
        cells.push(`${colName(col)}${r}=${String(v).replace(/\s+/g, ' ').slice(0, 90)}${fill}${strike}`);
      });
      if (cells.length) rows.push({ r, text: cells.join(' | ') });
    });
    for (const im of ws.getImages()) {
      const media = wb.getImage(Number(im.imageId));
      if (!media?.buffer) continue;
      const row = Math.floor(im.range.tl.nativeRow ?? im.range.tl.row ?? 0) + 1;
      const col = Math.floor(im.range.tl.nativeCol ?? im.range.tl.col ?? 0) + 1;
      const small = await shrinkImage(media.buffer, media.extension);
      if (small) images.push({ sheet: ws.name, row, cell: `${colName(col)}${row}`, ...small });
    }
    if (rows.length) sheets.push({ name: ws.name, rows });
  }
  images.sort((a, b) => a.sheet.localeCompare(b.sheet) || a.row - b.row);
  return { sheets, images };
}

// ---------- open items: what the supplier still has to ship ----------
export async function exportOpenItemsExcel(s, rows) {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('To ship', { views: [{ state: 'frozen', ySplit: 4 }] });
  // A PO | B Ser | C Picture | D Item | E Plating | F Carat | G Size | H QTY | I Shipped date | J Qty shipped | K Code
  ws.columns = [{ width: 10 }, { width: 7 }, { width: 15 }, { width: 34 }, { width: 11 }, { width: 9 }, { width: 13 }, { width: 8 }, { width: 15 }, { width: 12 }, { width: 14 }];
  ws.mergeCells('A1:K1');
  ws.getCell('A1').value = `ZENORA · ITEMS TO SHIP (${new Date().toISOString().slice(0, 10)})`;
  ws.getCell('A1').font = { bold: true, size: 15 };
  ws.mergeCells('A2:K2');
  ws.getCell('A2').value = 'When you send a package: write the date in "Shipped date" for every item in the box.';
  ws.mergeCells('A3:K3');
  ws.getCell('A3').value = 'If you send only part of a quantity, also write how many in "Qty shipped". Do not change anything else.';
  ['A2', 'A3'].forEach((c) => { ws.getCell(c).font = { italic: true, color: { argb: 'FF8A6100' } }; });
  const head = ['PO', 'Ser No.', 'Picture', 'Item', 'Plating', 'Carat', 'Size', 'QTY', 'Shipped date', 'Qty shipped', 'Code'];
  const hr = ws.getRow(4);
  head.forEach((h, i) => { const c = hr.getCell(i + 1); c.value = h; c.font = { bold: true }; c.alignment = { horizontal: 'center', vertical: 'middle' }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i === 8 || i === 9 ? 'FFFFE58A' : 'FFEDEDED' } }; });
  const images = await Promise.all(rows.map((r) => imageAsBase64(r.first.customImage || r.first.image || r.first.supplierImage, 240)));
  const thin = { style: 'thin', color: { argb: 'FFD4D4D4' } };
  rows.forEach((r, i) => {
    const n = 5 + i;
    const row = ws.getRow(n);
    row.values = [r.po, r.serNo, '', `${r.item}${r.remake ? '  (REMAKE)' : ''}${r.isGift ? '  (free gift)' : ''}`, supplierPlating(r.plating), r.carat || '', r.size || '', r.qty, null, null, r.ref];
    row.height = images[i]?.dataUrl ? 72 : 24;
    row.eachCell({ includeEmpty: true }, (c, col) => { if (col > 11) return; c.border = { top: thin, left: thin, bottom: thin, right: thin }; c.alignment = { vertical: 'middle', horizontal: col === 4 ? 'left' : 'center', wrapText: col === 4 }; });
    row.getCell(8).font = { bold: true, size: r.qty > 1 ? 14 : 11, color: { argb: r.qty > 1 ? 'FFB42318' : 'FF1A1A1A' } };
    [9, 10].forEach((c) => { row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF6CC' } }; });
    row.getCell(11).font = { color: { argb: 'FF8A8A8A' }, size: 9 };
    if (images[i]?.dataUrl) { const id = wb.addImage({ base64: images[i].dataUrl, extension: images[i].ext }); ws.addImage(id, { tl: { col: 2.08, row: n - 1 + 0.06 }, ext: { width: 88, height: 88 } }); }
  });
  const buf = await wb.xlsx.writeBuffer();
  return saveFile(`Zenora items to ship ${new Date().toISOString().slice(0, 10)}.xlsx`, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}

// Read the open-items file back: rows with a shipped date → packages (one per date).
export async function readShippedExcel(file, rows) {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const byKey = new Map(rows.map((r) => [`${r.po}|${String(r.ref).toUpperCase()}`, r]));
  const byPoSer = new Map(rows.map((r) => [`${r.po}|${r.serNo}`, r]));
  for (const ws of wb.worksheets) {
    let headRow = null; const cols = {};
    for (let r = 1; r <= Math.min(ws.rowCount, 40) && !headRow; r++) {
      ws.getRow(r).eachCell((c, col) => { if (/^\s*shipped\s*date\s*$/i.test(String(cellVal(c) ?? ''))) headRow = r; });
    }
    if (!headRow) continue;
    ws.getRow(headRow).eachCell((c, col) => {
      const t = String(cellVal(c) ?? '').trim().toLowerCase();
      if (t === 'po') cols.po = col; else if (/^ser/.test(t)) cols.ser = col; else if (/shipped\s*date/.test(t)) cols.date = col;
      else if (/qty\s*shipped/.test(t)) cols.qtyShipped = col; else if (/^code/.test(t)) cols.code = col;
    });
    const picks = []; const problems = [];
    for (let r = headRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const dateRaw = cellVal(row.getCell(cols.date));
      if (dateRaw == null || String(dateRaw).trim() === '') continue;
      const po = String(cellVal(row.getCell(cols.po)) ?? '').trim();
      const code = String(cellVal(row.getCell(cols.code)) ?? '').trim().toUpperCase();
      const ser = num(cellVal(row.getCell(cols.ser)));
      const hit = byKey.get(`${po}|${code}`) || byPoSer.get(`${po}|${ser}`);
      if (!hit) { problems.push(`Row ${r}: item not open anymore (already shipped?)`); continue; }
      const q = cols.qtyShipped ? num(cellVal(row.getCell(cols.qtyShipped))) : null;
      let date = dateRaw instanceof Date ? dateRaw : new Date(String(dateRaw).replace(/\./g, '-').replace(/\//g, '-'));
      if (isNaN(date)) date = new Date();
      picks.push({ row: hit, qty: Math.min(hit.qty, q || hit.qty), date: date.toISOString().slice(0, 10), raw: String(dateRaw) });
    }
    return { picks, problems };
  }
  throw new Error('This is not the "Items to ship" file (no "Shipped date" column).');
}
