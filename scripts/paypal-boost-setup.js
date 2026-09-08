// One-time PayPal setup for the auto-renewing top placement ("Boost") plan.
// The one-time 3/7/30-day boosts are plain Checkout orders and need no plan.
// Usage: PAYPAL_CLIENT_ID=... PAYPAL_CLIENT_SECRET=... node scripts/paypal-boost-setup.js
const { configured, pp, BASE } = require('../lib/paypal');

const CURRENCY = process.env.PAYPAL_CURRENCY || 'CAD';
const TAX_PERCENT = process.env.PAYPAL_TAX_PERCENT || '14.975';   // GST 5% + QST 9.975%
const PRICE = process.env.PAYPAL_BOOST_PRICE || '49.99';          // 30 days, auto-renewing

async function main() {
  if (!configured()) throw new Error('PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET required');
  console.log('PayPal API:', BASE);

  const { products = [] } = await pp('GET', '/v1/catalogs/products?page_size=20');
  const product = products.find(p => p.name === 'TrouvePro Top Placement') || await pp('POST', '/v1/catalogs/products', {
    name: 'TrouvePro Top Placement',
    description: 'Paid top placement in nearby search results for TrouvePro providers',
    type: 'SERVICE',
    category: 'ADVERTISING',
  });
  console.log('product:', product.id);

  const plan = await pp('POST', '/v1/billing/plans', {
    product_id: product.id,
    name: 'Top placement — 30 days, auto-renewing',
    description: `${PRICE}/30 days, plus GST/QST, cancel anytime`,
    billing_cycles: [{
      tenure_type: 'REGULAR',
      sequence: 1,
      total_cycles: 0,
      frequency: { interval_unit: 'MONTH', interval_count: 1 },
      pricing_scheme: { fixed_price: { value: PRICE, currency_code: CURRENCY } },
    }],
    payment_preferences: { auto_bill_outstanding: true, setup_fee_failure_action: 'CANCEL', payment_failure_threshold: 1 },
    taxes: { percentage: TAX_PERCENT, inclusive: false },
  });
  console.log('PAYPAL_BOOST_PLAN_ID=' + plan.id);
  console.log('Note: add PAYMENT.SALE.COMPLETED to the existing webhook so renewals extend the boost.');
}

main().catch(e => { console.error(e.message); process.exit(1); });
