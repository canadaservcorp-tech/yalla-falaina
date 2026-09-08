// One-time PayPal setup: creates the product, the billing plan and the webhook, then prints
// PAYPAL_PLAN_ID / PAYPAL_WEBHOOK_ID for the environment.
// Prices are grossed up so that ~$10/month is left after PayPal's fee (2.9% + $0.30 on the
// tax-inclusive amount), and GST+QST (14.975%) is added on top of the price by PayPal.
// Re-runnable: an existing product is reused, and --plan-only leaves the webhook alone
// (handy when the live plan has to be replaced because its price drifted from the site).
// Usage: PAYPAL_CLIENT_ID=... PAYPAL_CLIENT_SECRET=... PUBLIC_URL=https://... node scripts/paypal-setup.js [--plan-only]
const { configured, pp, BASE } = require('../lib/paypal');

const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000';
const CURRENCY = process.env.PAYPAL_CURRENCY || 'CAD';
const TAX_PERCENT = process.env.PAYPAL_TAX_PERCENT || '14.975';  // GST 5% + QST 9.975%
const INTRO_PRICE = process.env.PAYPAL_INTRO_PRICE || '5.49';    // nets ~$5.00 after fees
const PRICE = process.env.PAYPAL_PRICE || '10.66';               // nets ~$10.00 after fees
const EVENTS = [
  'BILLING.SUBSCRIPTION.ACTIVATED',
  'BILLING.SUBSCRIPTION.RE-ACTIVATED',
  'BILLING.SUBSCRIPTION.CANCELLED',
  'BILLING.SUBSCRIPTION.SUSPENDED',
  'BILLING.SUBSCRIPTION.EXPIRED',
  'BILLING.SUBSCRIPTION.PAYMENT.FAILED',
  'PAYMENT.SALE.COMPLETED',            // monthly renewals (also renews an auto boost)
];

async function findProduct(name) {
  const { products = [] } = await pp('GET', '/v1/catalogs/products?page_size=20');
  return products.find(p => p.name === name) || null;
}

async function main() {
  if (!configured()) throw new Error('PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET required');
  console.log('PayPal API:', BASE);

  const product = await findProduct('TrouvePro Provider Subscription') || await pp('POST', '/v1/catalogs/products', {
    name: 'TrouvePro Provider Subscription',
    description: 'Listing visibility for service providers on TrouvePro',
    type: 'SERVICE',
    category: 'SOFTWARE',
  });
  console.log('product:', product.id);

  const plan = await pp('POST', '/v1/billing/plans', {
    product_id: product.id,
    name: 'Provider monthly — intro 3 months',
    description: `${INTRO_PRICE}/month for the first 3 months, then ${PRICE}/month, plus GST/QST`,
    billing_cycles: [
      {
        tenure_type: 'TRIAL',
        sequence: 1,
        total_cycles: 3,
        frequency: { interval_unit: 'MONTH', interval_count: 1 },
        pricing_scheme: { fixed_price: { value: INTRO_PRICE, currency_code: CURRENCY } },
      },
      {
        tenure_type: 'REGULAR',
        sequence: 2,
        total_cycles: 0,
        frequency: { interval_unit: 'MONTH', interval_count: 1 },
        pricing_scheme: { fixed_price: { value: PRICE, currency_code: CURRENCY } },
      },
    ],
    payment_preferences: { auto_bill_outstanding: true, setup_fee_failure_action: 'CANCEL', payment_failure_threshold: 1 },
    taxes: { percentage: TAX_PERCENT, inclusive: false },
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
