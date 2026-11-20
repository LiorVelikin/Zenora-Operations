// The order chain: 5 simple steps for every item.
// Price checks and PO confirmation happen on the PO itself, not on the item.
export const STAGES = [
  { id: 'new', label: 'New: not ordered yet', short: 'New', color: '#8a8f98' },
  { id: 'ordered', label: 'Ordered from supplier', short: 'Ordered', color: '#3d6fb6' },
  { id: 'shipped', label: 'On the way to studio', short: 'On the way', color: '#6a4fb3' },
  { id: 'arrived', label: 'At studio: packing', short: 'Packing', color: '#c2683a' },
  { id: 'done', label: 'Sent to customer', short: 'Sent', color: '#2f8a5b' },
];
export const CANCELLED = { id: 'cancelled', label: 'Cancelled / refunded', short: 'Cancelled', color: '#b23b3b' };

export const stageIndex = (id) => STAGES.findIndex((s) => s.id === id);
export const stageOf = (id) => STAGES.find((s) => s.id === id) || CANCELLED;

// Order-level status = the slowest of its (non-cancelled) items.
export function orderStatus(lines) {
  const live = lines.filter((l) => l.status !== 'cancelled');
  if (!live.length) return { stage: CANCELLED, ahead: 0, total: 0 };
  let min = Infinity;
  live.forEach((l) => (min = Math.min(min, stageIndex(l.status))));
  const stage = STAGES[min];
  const ahead = live.filter((l) => stageIndex(l.status) > min).length;
  return { stage, ahead, total: live.length };
}

// What customer service tells the customer at each step (English for now).
const CS_TEXT = {
  new: {
    internal: 'Order received. Not ordered from the supplier yet.',
    reply: (o) => `Hi ${o.first}! Thank you for your order ${o.name}. Your order is confirmed and is now being prepared for production. We will update you as soon as it moves to the next stage.`,
  },
  ordered: {
    internal: 'Ordered from the supplier. In production.',
    reply: (o) => `Hi ${o.first}! Your order ${o.name} is in production right now. Every piece is made and checked for you, and we will update you as soon as it ships.`,
  },
  shipped: {
    internal: 'Finished and on its way to our studio for the final check and packing.',
    reply: (o) => `Hi ${o.first}! Great news: your jewelry for order ${o.name} is finished and on its way to our studio for a final quality check and gift packing. We will let you know as soon as it ships to you.`,
  },
  arrived: {
    internal: 'At our studio, going through the final check and packing.',
    reply: (o) => `Hi ${o.first}! Your jewelry for order ${o.name} has arrived at our studio and is going through its final quality check and packing. It will ship to you very soon.`,
  },
  done: {
    internal: 'Packed and handed over for delivery. The customer gets an SMS from the courier.',
    reply: (o) => `Hi ${o.first}! Your order ${o.name} is packed and on its way to you. The courier will contact you by SMS with the delivery details. Delivery usually takes 3-7 business days.`,
  },
  cancelled: {
    internal: 'Order cancelled or refunded.',
    reply: (o) => `Hi ${o.first}, your order ${o.name} was cancelled. If you have any questions, we are happy to help.`,
  },
};
export const csText = (stageId) => CS_TEXT[stageId] || CS_TEXT.new;

export function daysSince(iso) {
  if (!iso) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}
export function fmtDate(iso, withTime = false) {
  if (!iso) return '';
  const d = new Date(iso);
  const opts = { day: 'numeric', month: 'short' };
  if (withTime) Object.assign(opts, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleString('en-GB', opts);
}
export const money = (n) => (n == null || n === '' || isNaN(n) ? '—' : `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
