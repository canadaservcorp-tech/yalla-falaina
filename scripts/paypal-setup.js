// One-time PayPal setup: creates the product, the $25/month "Basic" billing
// plan and the webhook, then prints PAYPAL_PLAN_ID / PAYPAL_WEBHOOK_ID for
// the environment. Re-runnable: an existing product is reused, and
// --plan-only leaves the webhook alone.
// Usage: PAYPAL_CLIENT_ID=... PAYPAL_CLIENT_SECRET=... PUBLIC_URL=https://... node scripts/paypal-setup.js [--plan-only]
const { configured, pp, BASE } = require('../lib/paypal');

const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000';
const CURRENCY = process.env.PAYPAL_CURRENCY || 'USD';
const PRICE = process.env.PAYPAL_PRICE || '25.00';               // Section 4.3 — Basic tier
const TAX_PERCENT = process.env.PAYPAL_TAX_PERCENT || '0';       // set if a jurisdiction requires it
const EVENTS = [
  'BILLING.SUBSCRIPTION.ACTIVATED',
  'BILLING.SUBSCRIPTION.RE-ACTIVATED',
  'BILLING.SUBSCRIPTION.CANCELLED',
  'BILLING.SUBSCRIPTION.SUSPENDED',
  'BILLING.SUBSCRIPTION.EXPIRED',
  'BILLING.SUBSCRIPTION.PAYMENT.FAILED',
  'PAYMENT.SALE.COMPLETED',            // monthly renewals
];

async function findProduct(name) {
  const { products = [] } = await pp('GET', '/v1/catalogs/products?page_size=20');
  return products.find(p => p.name === name) || null;
}

async function main() {
  if (!configured()) throw new Error('PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET required');
  console.log('PayPal API:', BASE);

  const product = await findProduct('Yalla Nsafer Basic') || await pp('POST', '/v1/catalogs/products', {
    name: 'Yalla Nsafer Basic',
    description: 'Concierge access for job seekers on Yalla Nsafer',
    type: 'SERVICE',
    category: 'SOFTWARE',
  });
  console.log('product:', product.id);

  const plan = await pp('POST', '/v1/billing/plans', {
    product_id: product.id,
    name: 'Basic monthly',
    description: `Basic — ${PRICE} ${CURRENCY}/month`,
    billing_cycles: [
      {
        tenure_type: 'REGULAR',
        sequence: 1,
        total_cycles: 0,
        frequency: { interval_unit: 'MONTH', interval_count: 1 },
        pricing_scheme: { fixed_price: { value: PRICE, currency_code: CURRENCY } },
      },
    ],
    payment_preferences: { auto_bill_outstanding: true, setup_fee_failure_action: 'CANCEL', payment_failure_threshold: 1 },
    ...(Number(TAX_PERCENT) > 0 ? { taxes: { percentage: TAX_PERCENT, inclusive: false } } : {}),
  });
  console.log('PAYPAL_PLAN_ID=' + plan.id);
  if (process.argv.includes('--plan-only')) return;

  const url = `${PUBLIC_URL}/api/subscription/webhook`;
  const existing = await pp('GET', '/v1/notifications/webhooks');
  const hook = (existing.webhooks || []).find(w => w.url === url)
    || await pp('POST', '/v1/notifications/webhooks', { url, event_types: EVENTS.map(name => ({ name })) });
  console.log('PAYPAL_WEBHOOK_ID=' + hook.id, '→', url);
}

main().catch(e => { console.error(e.message); process.exit(1); });
