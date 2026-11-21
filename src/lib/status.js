import { getLang } from './i18n.js';
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

// What customer service sees (internal, English/Russian via t()) and the reply
// they copy to the customer (Hebrew: customers are in Israel). Written gender-neutral.
const hi = (o) => (o.first ? `היי ${o.first}` : 'היי');
const CS_TEXT = {
  new: {
    internal: 'Order received. Not ordered from the supplier yet.',
    reply: (o) => `${hi(o)}! תודה על ההזמנה ${o.name} 🤍\nההזמנה התקבלה ונמצאת עכשיו בהכנה לייצור. נעדכן ברגע שהיא תתקדם לשלב הבא.`,
  },
  ordered: {
    internal: 'Ordered from the supplier. In production.',
    reply: (o) => `${hi(o)}! ההזמנה ${o.name} נמצאת עכשיו בייצור ✨\nכל תכשיט מיוצר ונבדק במיוחד עבורך. נעדכן ברגע שההזמנה יוצאת לדרך.`,
  },
  shipped: {
    internal: 'Finished and on its way to our studio for the final check and packing.',
    reply: (o) => `${hi(o)}! חדשות טובות 🤍\nהתכשיטים מההזמנה ${o.name} מוכנים ונמצאים בדרך לסטודיו שלנו לבדיקת איכות אחרונה ואריזת מתנה. נעדכן ברגע שההזמנה יוצאת למשלוח.`,
  },
  arrived: {
    internal: 'At our studio, going through the final check and packing.',
    reply: (o) => `${hi(o)}! התכשיטים מההזמנה ${o.name} הגיעו לסטודיו שלנו ✨\nהם עוברים עכשיו בדיקת איכות אחרונה ואריזת מתנה, וההזמנה תצא למשלוח ממש בקרוב.`,
  },
  done: {
    internal: 'Packed and handed over for delivery. The customer gets an SMS from the courier.',
    reply: (o) => `${hi(o)}! ההזמנה ${o.name} נארזה ויצאה למשלוח 🚚\nחברת השליחויות תשלח הודעת SMS עם פרטי המסירה. זמן המשלוח הוא בדרך כלל 3-7 ימי עסקים.`,
  },
  cancelled: {
    internal: 'Order cancelled or refunded.',
    reply: (o) => `${hi(o)}, ההזמנה ${o.name} בוטלה. אם יש שאלות, נשמח לעזור 🤍`,
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
  return d.toLocaleString(getLang() === 'ru' ? 'ru-RU' : 'en-GB', opts);
}
export const money = (n) => (n == null || n === '' || isNaN(n) ? '—' : `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
