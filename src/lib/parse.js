// Turns Shopify orders into purchase lines the supplier understands.
// One Shopify line item = one "pack unit" (one box). A set becomes several
// purchase lines (one per piece) that share the same pack unit.

export const GIFT_PRODUCT_ID = '9609590833324';

export const PLATINGS = [
  { id: 'gold', label: 'Gold', supplier: 'gold', swatch: '#d4b24c' },
  { id: 'silver', label: 'White Gold', supplier: 'silver', swatch: '#cfd3d8' },
  { id: 'rose', label: 'Rose Gold', supplier: 'rose', swatch: '#d9a28f' },
];
export const platingLabel = (id) => PLATINGS.find((p) => p.id === id)?.label || 'Not set';

export const BOXES = {
  ring: 'Small ring box',
  earring: 'Small earring box',
  medium: 'Medium square box',
  bracelet: 'Long bracelet box',
  set: 'Big square set box',
};
export const BOX_OPTIONS = Object.values(BOXES);

export const shortId = (gid) => String(gid || '').split('/').pop();

// --- metal / plating -------------------------------------------------------
export function platingFromText(text) {
  const t = ` ${String(text || '').toLowerCase()} `;
  if (/rose[\s-]*gold/.test(t)) return 'rose';
  if (/white[\s-]*gold|silver/.test(t)) return 'silver';
  if (/yellow[\s-]*gold|\bgold\b|18k-gold/.test(t)) return 'gold';
  return null;
}

// --- names -----------------------------------------------------------------
export function itemNameFromTitle(title) {
  return String(title || '')
    .replace(/\s+[-–]\s+(18k\s+)?(white|yellow|rose)?\s*gold\s*$/i, '')
    .replace(/\s+[-–]\s+silver\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function categoryOf(title) {
  const t = String(title || '').toLowerCase();
  if (/\bring\b|טבעת/.test(t)) return 'ring';
  if (/earring|stud|hoop|huggie|עגיל/.test(t)) return 'earrings';
  if (/bracelet|bangle|צמיד/.test(t)) return 'bracelet';
  if (/necklace|pendant|chain|שרשר|תליון/.test(t)) return 'necklace';
  if (/\bset\b/.test(t)) return 'set';
  return 'other';
}

export function boxFor(category, title) {
  const t = String(title || '').toLowerCase();
  if (category === 'ring') return BOXES.ring;
  if (category === 'earrings') return BOXES.earring;
  if (category === 'bracelet') return BOXES.bracelet;
  if (category === 'necklace') return /tennis/.test(t) ? BOXES.set : BOXES.medium;
  return BOXES.medium;
}

// --- sizes -----------------------------------------------------------------
// Supplier style, matching her sheet: "2ct", "1ct size6", "55cm", "size 4"
export function sizeFromOptions(options = []) {
  const parts = [];
  for (const { name, value } of options) {
    if (!value || /default title/i.test(value) || name === 'Title') continue;
    if (/ring\s*size/i.test(name)) parts.push(`size ${value}`);
    else parts.push(String(value).replace(/\s+/g, ''));
  }
  // carat first, then ring size, then lengths
  return parts.join(' ');
}

// Carat lives in its own field: "2ct size 5" → { carat: '2ct', size: 'size 5' }
export function splitCarat(str) {
  const text = String(str || '');
  const m = text.match(/(\d+(?:\.\d+)?)\s*ct\b/i);
  if (!m) return { carat: '', size: text.trim() };
  return { carat: `${m[1]}ct`, size: text.replace(m[0], '').replace(/\s{2,}/g, ' ').trim() };
}
// What the supplier sees in her "size" column, like her sheet: "1ct size6", "2ct 45cm".
export const fullSize = (l) => [l?.carat, l?.size].filter(Boolean).join(' ');

// --- sets --------------------------------------------------------------------
const opt = (options, re) => options.find((o) => re.test(o.name))?.value || '';

function setPieces(title, options) {
  const t = String(title || '').toLowerCase();
  if (/bridal ring set/.test(t)) return null; // a ring, not a jewellery set
  if (/essential brilliance set/.test(t)) {
    return {
      box: BOXES.set,
      pieces: [
        { name: 'Stud Earrings 2ct', category: 'earrings', size: '2ct' },
        { name: 'Solitaire Pendant Necklace 2ct', category: 'necklace', size: '2ct 45cm', sizeAssumed: true },
        { name: 'Tennis Bracelet 3mm', category: 'bracelet', size: opt(options, /bracelet/i).replace(/\s+/g, '') },
      ],
    };
  }
  const tennis = t.match(/(men'?s\s+)?tennis set\s*(\d)\s*mm/);
  if (tennis) {
    const men = tennis[1] ? "Men's " : '';
    const mm = tennis[2];
    return {
      box: BOXES.set,
      pieces: [
        { name: `${men}Tennis Necklace ${mm}mm`, category: 'necklace', size: opt(options, /necklace/i).replace(/\s+/g, '') },
        { name: `${men}Tennis Bracelet ${mm}mm`, category: 'bracelet', size: opt(options, /bracelet/i).replace(/\s+/g, '') },
      ],
    };
  }
  if (/solitaire set/.test(t)) {
    return {
      box: BOXES.medium,
      pieces: [
        { name: 'Classic Stud Earrings 2ct', category: 'earrings', size: '2ct' },
        { name: 'Solitaire Pendant Necklace 2ct', category: 'necklace', size: '2ct 45cm', sizeAssumed: true },
      ],
    };
  }
  if (/[ée]lise set/.test(t)) {
    return {
      box: BOXES.set,
      pieces: [
        { name: 'Élise Necklace', category: 'necklace', size: '' },
        { name: 'Élise Bracelet', category: 'bracelet', size: '18cm' },
      ],
    };
  }
  return null;
}

// Gift metal follows the order: all items yellow → yellow gift. Mixed → the most common one (flagged).
export function giftPlating(platings) {
  const known = platings.filter(Boolean);
  if (!known.length) return null;
  const count = {};
  known.forEach((p) => { count[p] = (count[p] || 0) + 1; });
  return Object.entries(count).sort((a, b) => b[1] - a[1])[0][0];
}
export const mixedMetals = (platings) => new Set(platings.filter(Boolean)).size > 1;

// --- order → app records -----------------------------------------------------
export function orderStateFromShopify(o) {
  const fin = o.displayFinancialStatus;
  const ful = o.displayFulfillmentStatus;
  if (o.cancelledAt || fin === 'REFUNDED' || fin === 'VOIDED' || ful === 'FULFILLMENT_NOT_REQUIRED') return 'cancelled';
  if (ful === 'FULFILLED') return 'fulfilled';
  if (fin === 'PAID' || fin === 'PARTIALLY_PAID' || fin === 'PARTIALLY_REFUNDED') return 'open';
  return 'unpaid';
}

export function normalizeOrder(o) {
  const addr = o.shippingAddress || {};
  return {
    id: shortId(o.id),
    gid: o.id,
    name: o.name,
    createdAt: o.createdAt,
    customer: addr.name || o.customer?.displayName || '',
    phone: addr.phone || o.customer?.defaultPhoneNumber?.phoneNumber || o.phone || '',
    email: o.email || '',
    city: addr.city || '',
    address: [addr.address1, addr.address2].filter(Boolean).join(', '),
    note: o.note || '',
    shopifyState: orderStateFromShopify(o),
    financial: o.displayFinancialStatus,
    fulfilledAt: o.fulfillments?.find((f) => f.status === 'SUCCESS')?.createdAt || null,
  };
}

export const isRemovedItem = (li) => li.currentQuantity === 0 && !(li.unfulfilledQuantity > 0);

// Build purchase lines for one order. productDefaults remembers a plating per
// product when the title has no metal (e.g. "Solitaire Pendant Necklace").
export function linesFromOrder(o, productDefaults = {}) {
  const orderId = shortId(o.id);
  // Items removed from the order in Shopify (edited, exchanged or refunded) have currentQuantity 0.
  const items = (o.lineItems?.nodes || []).filter((li) => !isRemovedItem(li));
  const out = [];

  const realItems = items.filter((li) => shortId(li.product?.id) !== GIFT_PRODUCT_ID && !/מתנה/.test(li.title));
  const orderPlating = giftPlating(realItems.map((li) => platingFromText(li.title) || productDefaults[shortId(li.product?.id)]));

  items.forEach((li) => {
    const lineItemId = shortId(li.id);
    const productId = li.product ? shortId(li.product.id) : null;
    const options = (li.variant?.selectedOptions || []).filter((x) => x.name !== 'Title');
    const image = li.image?.url || null;
    const isGift = productId === GIFT_PRODUCT_ID || /מתנה/.test(li.title);
    const isCustom = !li.product;
    const flags = [];

    let plating = platingFromText(li.title) || (productId && productDefaults[productId]) || null;
    if (isGift) {
      plating = orderPlating;
      flags.push('gift');
    }
    if (isCustom) flags.push('custom');

    const base = {
      orderId,
      orderName: o.name,
      lineItemId,
      productId,
      shopifyTitle: li.title,
      image,
      plating,
      platingSource: isGift ? 'order' : plating ? 'title' : null,
      qty: (li.unfulfilledQuantity > 0 ? li.unfulfilledQuantity : (li.currentQuantity ?? li.quantity)) || 1,
      alreadySent: li.unfulfilledQuantity === 0,
      flags,
    };

    if (isGift) {
      out.push({
        ...base,
        id: `${lineItemId}-0`,
        item: 'Classic Stud Earrings 2ct (GIFT)',
        category: 'earrings',
        size: '2ct',
        box: BOXES.earring,
        packUnit: lineItemId,
        packLabel: 'Gift earrings 2ct',
      });
      return;
    }

    const set = isCustom ? null : setPieces(li.title, options);
    if (set) {
      set.pieces.forEach((p, i) => {
        out.push({
          ...base,
          id: `${lineItemId}-${i}`,
          item: p.name,
          category: p.category,
          size: p.size,
          sizeAssumed: !!p.sizeAssumed,
          box: set.box,
          packUnit: lineItemId,
          packLabel: itemNameFromTitle(li.title),
          setName: itemNameFromTitle(li.title),
          flags: [...flags, 'set'],
        });
      });
      return;
    }

    const category = categoryOf(li.title);
    out.push({
      ...base,
      id: `${lineItemId}-0`,
      item: isCustom ? li.title : itemNameFromTitle(li.title),
      category,
      size: sizeFromOptions(options) || (li.variantTitle && !/default/i.test(li.variantTitle) ? li.variantTitle : ''),
      box: boxFor(category, li.title),
      packUnit: lineItemId,
      packLabel: isCustom ? li.title : itemNameFromTitle(li.title),
    });
  });

  return out.map((l) => ({ ...l, ...splitCarat(l.size) }));
}

// Problems Lior should look at before a line goes to the supplier.
export function lineWarnings(line, order) {
  const w = [];
  if (!line.plating) w.push({ level: 'block', text: 'Choose plating (metal not in product title)' });
  if (line.flags?.includes('custom')) w.push({ level: 'warn', text: 'Manual item: check the name and size' });
  if (line.flags?.includes('gift') && line.platingSource === 'order') w.push({ level: 'info', text: 'Gift: metal matched to the order' });
  if (line.sizeAssumed && !line.sizeEdited) w.push({ level: 'info', text: 'Chain length assumed 45cm' });
  if (order?.note) w.push({ level: 'warn', text: `Customer note: “${order.note}”` });
  return w;
}

// Key used for price history: same piece + plating + size = same price.
export function priceKey(line) {
  return [line.item.replace(/\s*\(GIFT\)/, ''), line.plating || '?', fullSize(line)].join(' | ');
}
