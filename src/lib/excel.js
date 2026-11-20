import { fullSize } from './parse.js';
// Excel in the supplier's own JINGJING layout (columns A–H match her sheet),
// plus Item / Notes / Zenora ref columns so her filled file can be read back.
import { linesOfPO, poRows } from './store.js';
import { PLATINGS } from './parse.js';
import { saveFile, imageAsBase64 } from './platform.js';

const loadExcel = async () => (await import('exceljs/dist/exceljs.min.js')).default;
const supplierPlating = (id) => PLATINGS.find((p) => p.id === id)?.supplier || '';

const SHIPPED = ['shipped', 'arrived', 'done'];
export function rowShipped(r) { return r.lines.filter((l) => SHIPPED.includes(l.status)).reduce((t, l) => t + (l.qty || 1), 0); }
function rowLastShipDate(s, r) {
  const d = r.lines.map((l) => l.shipmentId && s.shipments[l.shipmentId]?.shippedAt).filter(Boolean).sort().pop();
  return d ? new Date(d) : null;
}

export async function exportPOExcel(s, poId) {
  const ExcelJS = await loadExcel();
  const po = s.pos[poId];
  const rows = poRows(s, poId);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Zenora';
  const ws = wb.addWorksheet(po.number, { views: [{ state: 'frozen', ySplit: 5 }] });
  // A Ser | B Picture | C Item | D Plating | E Carat | F Size | G QTY | H Price/pc | I Total | J Shipped date | K Qty shipped | L Notes | M Code
  ws.columns = [{ width: 7 }, { width: 15 }, { width: 32 }, { width: 10 }, { width: 8 }, { width: 12 }, { width: 7 }, { width: 13 }, { width: 11 }, { width: 13 }, { width: 10 }, { width: 26 }, { width: 13 }];
  ws.mergeCells('A1:M1');
  ws.getCell('A1').value = `ZENORA · PURCHASE ORDER ${po.number}`;
  ws.getCell('A1').font = { bold: true, size: 15 };
  ws.getCell('A2').value = `To: ${s.supplierName}`;
  ws.getCell('L2').value = `Date: ${new Date(po.sentAt || po.createdAt).toISOString().slice(0, 10)}`;
  ws.mergeCells('A3:M3');
  ws.getCell('A3').value = '1) Write the price for ONE piece in the yellow "Price per piece" column. The total is calculated automatically.';
  ws.mergeCells('A4:M4');
  ws.getCell('A4').value = '2) Every time you send a package: write the date in "Shipped date". If you sent only part of the quantity, write how many in "Qty shipped". Do not change anything else.';
  ['A3', 'A4'].forEach((c) => { ws.getCell(c).font = { italic: true, color: { argb: 'FF8A6100' } }; });

  const head = ['Ser No.', 'Picture', 'Item', 'Plating', 'Carat', 'Size', 'QTY', 'Price per piece (USD)', 'Total (USD)', 'Shipped date', 'Qty shipped', 'Notes', 'Code'];
  const hr = ws.getRow(5);
  head.forEach((h, i) => {
    const c = hr.getCell(i + 1);
    c.value = h; c.font = { bold: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: [7, 9, 10].includes(i) ? 'FFFFE58A' : 'FFEDEDED' } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  hr.height = 32;

  const images = await Promise.all(rows.map((r) => imageAsBase64(r.first.customImage || r.first.image || r.first.supplierImage, 240)));
  const thin = { style: 'thin', color: { argb: 'FFD4D4D4' } };
  rows.forEach((r, i) => {
    const n = 6 + i;
    const row = ws.getRow(n);
    const note = [r.isGift ? `FREE GIFT for ${r.orders.length} order${r.orders.length > 1 ? 's' : ''}` : '', r.supplierNote].filter(Boolean).join(' · ');
    const shipped = rowShipped(r);
    row.values = [r.serNo, '', r.item, supplierPlating(r.plating), r.carat || '', r.size || '', r.qty, r.price ?? null, null, shipped ? rowLastShipDate(s, r) : null, shipped || null, note, r.ref];
    row.getCell(9).value = { formula: `IF(H${n}="","",G${n}*H${n})` };
    row.height = images[i] ? 72 : 24;
    row.eachCell({ includeEmpty: true }, (c, col) => {
      if (col > 13) return;
      c.border = { top: thin, left: thin, bottom: thin, right: thin };
      c.alignment = { vertical: 'middle', horizontal: [3, 12].includes(col) ? 'left' : 'center', wrapText: [3, 12].includes(col) };
    });
    row.getCell(7).font = { bold: true, size: r.qty > 1 ? 14 : 11, color: { argb: r.qty > 1 ? 'FFB42318' : 'FF1A1A1A' } };
    [8, 10, 11].forEach((c) => { row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF6CC' } }; });
    row.getCell(8).numFmt = '0.00'; row.getCell(9).numFmt = '0.00'; row.getCell(9).font = { bold: true };
    row.getCell(10).numFmt = 'dd/mm/yyyy';
    row.getCell(13).font = { color: { argb: 'FF8A8A8A' }, size: 9 };
    if (images[i]) {
      const id = wb.addImage({ base64: images[i].dataUrl, extension: images[i].ext });
      ws.addImage(id, { tl: { col: 1.08, row: n - 1 + 0.06 }, ext: { width: 88, height: 88 } });
    }
  });
  const last = 5 + rows.length;
  const sumR = last + 1, dhlR = last + 2, totR = last + 3;
  ws.getCell(`H${sumR}`).value = 'Items';
  ws.getCell(`I${sumR}`).value = { formula: `SUM(I6:I${last})` };
  ws.getCell(`H${dhlR}`).value = 'DHL';
  ws.getCell(`I${dhlR}`).value = po.shipping ?? null;
  ws.getCell(`I${dhlR}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF6CC' } };
  ws.getCell(`H${totR}`).value = 'TOTAL';
  ws.getCell(`I${totR}`).value = { formula: `I${sumR}+I${dhlR}` };
  [sumR, dhlR, totR].forEach((r) => { ws.getCell(`H${r}`).font = { bold: true }; ws.getCell(`I${r}`).font = { bold: true }; ws.getCell(`I${r}`).numFmt = '0.00'; });

  const buf = await wb.xlsx.writeBuffer();
  return saveFile(`Zenora ${po.number}.xlsx`, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
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
    row.height = images[i] ? 72 : 24;
    row.eachCell({ includeEmpty: true }, (c, col) => { if (col > 11) return; c.border = { top: thin, left: thin, bottom: thin, right: thin }; c.alignment = { vertical: 'middle', horizontal: col === 4 ? 'left' : 'center', wrapText: col === 4 }; });
    row.getCell(8).font = { bold: true, size: r.qty > 1 ? 14 : 11, color: { argb: r.qty > 1 ? 'FFB42318' : 'FF1A1A1A' } };
    [9, 10].forEach((c) => { row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF6CC' } }; });
    row.getCell(11).font = { color: { argb: 'FF8A8A8A' }, size: 9 };
    if (images[i]) { const id = wb.addImage({ base64: images[i].dataUrl, extension: images[i].ext }); ws.addImage(id, { tl: { col: 2.08, row: n - 1 + 0.06 }, ext: { width: 88, height: 88 } }); }
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
