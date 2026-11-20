// Fallback snapshot of open Shopify orders (taken 19 Nov 2026), used only when the
// live Shopify pull is unavailable in the preview. Shape is normalised by parse.js.
// [name, orderId, createdAt, financial, fulfillment, note, customer, phone, city, lines]
// line: [lineId, title, variantTitle, [[option, value]...], qty, productId]
const GIFT = 'מתנה — זוג עגילים קלאסיים 2 קראט 🎁';
const G = (id) => [id, GIFT, null, [], 1, 9609590833324];

export const SNAPSHOT_TAKEN = '2026-11-19T01:00:00Z';

export const SNAPSHOT = []; // preview-only sample data, intentionally empty in the live repo

// Convert the compact snapshot into the same shape the live GraphQL pull returns.
export function snapshotAsGraphql() {
  return SNAPSHOT.map(([name, id, createdAt, fin, ful, note, cust, phone, city, lines, fulfilledAt]) => ({
    id: `gid://shopify/Order/${id}`,
    name,
    createdAt,
    cancelledAt: null,
    displayFinancialStatus: fin,
    displayFulfillmentStatus: ful,
    note,
    phone: null,
    email: null,
    shippingAddress: { name: cust, phone, city },
    customer: { displayName: cust },
    fulfillments: fulfilledAt ? [{ createdAt: fulfilledAt, status: 'SUCCESS' }] : [],
    lineItems: {
      nodes: lines.map(([lid, title, variantTitle, opts, qty, pid]) => ({
        id: `gid://shopify/LineItem/${lid}`,
        title,
        variantTitle,
        quantity: qty,
        image: null,
        variant: { selectedOptions: opts.map(([name, value]) => ({ name, value })) },
        product: pid ? { id: `gid://shopify/Product/${pid}`, handle: '', title } : null,
      })),
    },
  }));
}
