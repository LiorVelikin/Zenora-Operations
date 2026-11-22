import { poRows, poTotals } from './store.js';
import { PLATINGS } from './parse.js';
import { saveFile, imageAsBase64 } from './platform.js';

const supplierPlating = (id) => PLATINGS.find((p) => p.id === id)?.supplier || '';
const usd = (n) => (n == null ? '' : `$${Number(n).toFixed(2).replace(/\.00$/, '')}`);

export async function exportPOPdf(s, poId) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const po = s.pos[poId];
  const lines = poRows(s, poId);
  const t = poTotals(s, poId);
  const images = await Promise.all(lines.map((l) => imageAsBase64(l.first.customImage || l.first.image || l.first.supplierImage, 200)));
  const hasImg = images.some((x) => x?.dataUrl);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text(`Lior ${po.number}`, 40, 46);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(`To: ${s.supplierName}`, 40, 64);
  doc.text(`Date: ${new Date(po.sentAt || po.createdAt).toISOString().slice(0, 10)}`, 40, 78);
  doc.setTextColor(122, 93, 58);
  doc.text('Please reply with the price for each line and the DHL cost.', 40, 92);
  doc.setTextColor(0);

  const pic = hasImg ? [''] : [];
  const body = lines.map((l) => [
    l.serNo, ...pic, String(l.item || '').replace(/\s*\(GIFT\)/i, ''), 'silver', supplierPlating(l.plating), fullSize(l), l.qty,
    usd(l.price), l.price != null ? usd(l.price * l.qty) : '', l.supplierNote || '',
  ]);
  const pad = ['', ...pic, '', '', '', '', ''];
  body.push([...pad, 'Subtotal', t.priced ? usd(t.sub) : '', '']);
  body.push([...pad, 'DHL', usd(po.shipping), '']);
  body.push([...pad, 'Total', t.priced ? usd(t.total) : '', '']);
  const off = hasImg ? 1 : 0;

  autoTable(doc, {
    startY: 106,
    head: [['Ser No.', ...(hasImg ? ['Picture'] : []), 'Item', 'Material', 'Plating', 'Size', 'QTY', 'Price / pc', 'Total', 'Notes']],
    body,
    theme: 'grid',
    styles: { fontSize: 9.5, cellPadding: 5, valign: 'middle', lineColor: [217, 210, 199] },
    headStyles: { fillColor: [244, 237, 227], textColor: 30, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 40, halign: 'center' }, ...(hasImg ? { 1: { cellWidth: 62 } } : {}), [1 + off]: { cellWidth: 190 }, [5 + off]: { halign: 'center' }, [6 + off]: { halign: 'right' }, [7 + off]: { halign: 'right' } },
    didParseCell: (d) => {
      if (d.section === 'body' && d.row.index < lines.length && hasImg) d.cell.styles.minCellHeight = 58;
      if (d.section === 'body' && d.row.index >= lines.length) d.cell.styles.fontStyle = 'bold';
    },
    didDrawCell: (d) => {
      if (hasImg && d.section === 'body' && d.column.index === 1 && d.row.index < lines.length) {
        const img = images[d.row.index];
        if (img?.dataUrl) doc.addImage(img.dataUrl, img.ext.toUpperCase(), d.cell.x + 3, d.cell.y + 3, 52, 52);
      }
    },
  });

  const blob = doc.output('blob');
  return saveFile(`Lior ${po.number}.pdf`, blob);
}
