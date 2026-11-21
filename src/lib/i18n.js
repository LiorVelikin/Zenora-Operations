// English / Russian for the team screens (packing + customer service).
// Usage: t('Ready to pack') or t('{n} of {m} here', { n, m }). Missing words fall back to English.
import { useSyncExternalStore } from 'react';

const KEY = 'zenora-lang';
let lang = (() => { try { return localStorage.getItem(KEY) === 'ru' ? 'ru' : 'en'; } catch { return 'en'; } })();
const subs = new Set();

export const getLang = () => lang;
export function setLang(l) {
  lang = l === 'ru' ? 'ru' : 'en';
  try { localStorage.setItem(KEY, lang); } catch { /* ignore */ }
  subs.forEach((f) => f());
}
export function useLang() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => lang, () => lang);
}

const RU = {
  // shell / login
  'Saved': 'Сохранено',
  'Saving…': 'Сохраняется…',
  'Offline: retrying…': 'Нет связи: повтор…',
  'Log out': 'Выйти',
  'Admin': 'Админ',
  'Packing': 'Упаковка',
  'Customer service': 'Служба поддержки',
  'Supplier': 'Поставщик',
  'Your code': 'Ваш код',
  'Enter': 'Войти',
  'Checking…': 'Проверка…',
  'Wrong code. Try again.': 'Неверный код. Попробуйте ещё раз.',
  'Loading…': 'Загрузка…',

  // steps
  'New': 'Новый',
  'Ordered': 'Заказано',
  'On the way': 'В пути',
  'Sent': 'Отправлено',
  'Cancelled': 'Отменён',

  // metals, boxes, sizes
  'Gold': 'Золото',
  'White Gold': 'Белое золото',
  'Rose Gold': 'Розовое золото',
  'Not set': 'Не указано',
  'Small ring box': 'Маленькая коробка для кольца',
  'Small earring box': 'Маленькая коробка для серёг',
  'Medium square box': 'Средняя квадратная коробка',
  'Long bracelet box': 'Длинная коробка для браслета',
  'Big square set box': 'Большая квадратная коробка для набора',
  'One size': 'Без размера',
  'one size': 'без размера',
  'size': 'размер',

  // packing screen
  'Cards': 'Карточки',
  'List': 'Список',
  'Ready to pack': 'Готово к упаковке',
  'Complete when package arrives': 'Будет готово с посылкой',
  'Complete when the package arrives': 'Будет готово, когда придёт посылка',
  'Standby': 'Ожидание',
  'Waiting': 'Ждём',
  'Packages on the way': 'Посылки в пути',
  'When one arrives, check it in. You can also mark single items as "Here" below.': 'Когда посылка придёт, отметьте её. Можно также отметить отдельные изделия как «Здесь» ниже.',
  '{n} items · sent {d} ({days} days ago)': '{n} изд. · отправлено {d} ({days} дн. назад)',
  'It arrived': 'Пришла',
  "Tick what's here": 'Отметить, что пришло',
  '{n} items': '{n} изд.',
  'Earlier packages': 'Прошлые посылки',
  'Shipped before the system started. Some may already be at the studio.': 'Отправлено до запуска системы. Часть может быть уже в студии.',
  'Delete': 'Удалить',
  'Everything is here. Pack in any order you like.': 'Всё на месте. Упаковывайте в любом порядке.',
  'Nothing is complete yet.': 'Пока нет готовых заказов.',
  'The missing items are already on the way.': 'Недостающие изделия уже в пути.',
  'Standby: part of the order is here': 'Ожидание: часть заказа уже здесь',
  'Keep these items on the standby shelf until the rest comes.': 'Держите эти изделия на полке ожидания, пока не придёт остальное.',
  'Waiting: nothing here yet ({n})': 'Ждём: пока ничего нет ({n})',
  'Recently packed ({n})': 'Недавно упаковано ({n})',
  'Undo': 'Отменить',
  'STOCK': 'СКЛАД',
  'No customer': 'Без клиента',
  '{n} of {m} here': '{n} из {m} здесь',
  '{d} days': '{d} дн.',
  'ordered {d} days ago': 'заказ {d} дн. назад',
  'Customer note': 'Заметка клиента',
  'GIFT': 'ПОДАРОК',
  'Here': 'Здесь',
  'On the way · {p}': 'В пути · {p}',
  'Not ordered yet': 'Ещё не заказано',
  'Being made': 'В производстве',
  'Being made (remake)': 'Переделывается',
  'Missing from {p}': 'Не было в {p}',
  "It's here": 'Уже здесь',
  'Not here': 'Нет здесь',
  'Edit': 'Изменить',
  '{name} marked as here': '{name} отмечено как «здесь»',
  'Put away in stock': 'Убрать на склад',
  'GRA certificate × {n}': 'Сертификат GRA × {n}',
  'Thank-you card': 'Открытка «Спасибо»',
  'Set': 'Набор',
  'all {n} pieces together': 'все {n} шт. вместе',
  'Packed ✓': 'Упаковано ✓',
  'Tick everything first': 'Сначала отметьте всё',
  'Done': 'Готово',
  '{name} packed': '{name} упакован',
  'Comes with {p}': 'Придёт с посылкой: {p}',
  'Save: {n} here': 'Сохранить: {n} здесь',
  '{n} marked as here': 'Отмечено «здесь»: {n}',
  '{p} (sent {d})': '{p} (отправлено {d})',
  '{p}: open the box and tick each item you find ({n}/{m})': '{p}: откройте коробку и отметьте каждое изделие ({n}/{m})',
  'Tick all': 'Отметить всё',
  'Done: everything is here': 'Готово: всё на месте',
  'Done ({n} missing)': 'Готово (не хватает: {n})',
  'All checked in': 'Всё принято',
  '{n} item(s) marked missing': 'Не хватает изделий: {n}',
  '(gift)': '(подарок)',
  'Order': 'Заказ',
  'Customer': 'Клиент',
  'Items': 'Изделия',
  'Status': 'Статус',
  'Arrives with package': 'Придёт с посылкой',
  '{d}d ago': '{d} дн. назад',
  '{n} selected': 'Выбрано: {n}',
  'Mark packed': 'Отметить упакованными',
  'Mark packed ({n} ready)': 'Отметить упакованными ({n} готово)',
  'Clear': 'Сбросить',
  '{n} orders marked packed': 'Упаковано заказов: {n}',
  'Late': 'Задержка',

  // customer service screen
  'Find an order': 'Найти заказ',
  "Type the order number, the customer's name or phone.": 'Введите номер заказа, имя или телефон клиента.',
  'e.g. 1496 or 054…': 'напр. 1496 или 054…',
  '{n} found': 'Найдено: {n}',
  'Latest orders': 'Последние заказы',
  'No orders yet': 'Заказов пока нет',
  'No order found': 'Заказ не найден',
  'Check the number, or ask Lior.': 'Проверьте номер или спросите Лиора.',
  '{d} · {days} days ago': '{d} · {days} дн. назад',
  'Back to search': 'Назад к поиску',
  'ordered {d} · {days} days ago': 'заказ {d} · {days} дн. назад',
  'This order was cancelled or refunded.': 'Этот заказ отменён или возвращён.',
  'Order received. Not ordered from the supplier yet.': 'Заказ получен. У поставщика ещё не заказан.',
  'Ordered from the supplier. In production.': 'Заказано у поставщика. В производстве.',
  'Finished and on its way to our studio for the final check and packing.': 'Готово и едет в нашу студию на финальную проверку и упаковку.',
  'At our studio, going through the final check and packing.': 'В нашей студии: финальная проверка и упаковка.',
  'Packed and handed over for delivery. The customer gets an SMS from the courier.': 'Упаковано и передано в доставку. Клиент получит SMS от курьера.',
  'Order cancelled or refunded.': 'Заказ отменён или возвращён.',
  'Ordered {d} days ago. Ask Lior before promising a date.': 'Заказ сделан {d} дн. назад. Спросите Лиора, прежде чем обещать дату.',
  'Reply to the customer (Hebrew)': 'Ответ клиенту (на иврите)',
  'Copy': 'Копировать',
  'Copied': 'Скопировано',
  'What they ordered': 'Что заказано',
  'Phone': 'Телефон',
  'Note': 'Заметка',
};

export function t(en, vars) {
  let s = (lang === 'ru' && RU[en]) || en;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
  return s;
}

// "size 7" → "размер 7" in Russian; other sizes (18cm, 2ct) stay as they are.
export const tSize = (str) => (lang === 'ru' && str ? str.replace(/\bsize\s*/gi, `${RU.size} `) : str);
