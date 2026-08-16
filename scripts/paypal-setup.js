// One-time PayPal setup: creates the product, the billing plan ($5/mo for 3 cycles, then $10/mo)
// and the webhook, then prints PAYPAL_PLAN_ID / PAYPAL_WEBHOOK_ID for the environment.
// Usage: PAYPAL_CLIENT_ID=... PAYPAL_CLIENT_SECRET=... PUBLIC_URL=https://... node scripts/paypal-setup.js
const { configured, pp, BASE } = require('../lib/paypal');

const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000';
const CURRENCY = process.env.PAYPAL_CURRENCY || 'CAD';
const EVENTS = [
  'BILLING.SUBSCRIPTION.ACTIVATED',
  'BILLING.SUBSCRIPTION.RE-ACTIVATED',
  'BILLING.SUBSCRIPTION.CANCELLED',
  'BILLING.SUBSCRIPTION.SUSPENDED',
  'BILLING.SUBSCRIPTION.EXPIRED',
  'BILLING.SUBSCRIPTION.PAYMENT.FAILED',
];

async function main() {
  if (!configured()) throw new Error('PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET required');
  console.log('PayPal API:', BASE);

  const product = await pp('POST', '/v1/catalogs/products', {
    name: 'TrouvePro Provider Subscription',
    description: 'Listing visibility for service providers on TrouvePro',
    type: 'SERVICE',
    category: 'SOFTWARE',
  });
  console.log('product:', product.id);

  const plan = await pp('POST', '/v1/billing/plans', {
    product_id: product.id,
    name: 'Provider monthly — intro 3 months',
    description: '$15 for the first 3 months, then $10/month',
    billing_cycles: [
      {
        tenure_type: 'TRIAL',
        sequence: 1,
        total_cycles: 3,
        frequency: { interval_unit: 'MONTH', interval_count: 1 },
        pricing_scheme: { fixed_price: { value: '5.00', currency_code: CURRENCY } },
      },
      {
        tenure_type: 'REGULAR',
        sequence: 2,
        total_cycles: 0,
        frequency: { interval_unit: 'MONTH', interval_count: 1 },
        pricing_scheme: { fixed_price: { value: '10.00', currency_code: CURRENCY } },
      },
    ],
    payment_preferences: { auto_bill_outstanding: true, setup_fee_failure_action: 'CANCEL', payment_failure_threshold: 1 },
  });
  console.log('PAYPAL_PLAN_ID=' + plan.id);

  const url = `${PUBLIC_URL}/api/subscription/webhook`;
  const existing = await pp('GET', '/v1/notifications/webhooks');
  const hook = (existing.webhooks || []).find(w => w.url === url)
    || await pp('POST', '/v1/notifications/webhooks', { url, event_types: EVENTS.map(name => ({ name })) });
  console.log('PAYPAL_WEBHOOK_ID=' + hook.id, '→', url);
}

main().catch(e => { console.error(e.message); process.exit(1); });
