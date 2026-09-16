// lib/flightSearch.js, lib/hotelSearch.js, lib/translate.js -- thin
// provider-abstraction wrappers, same configured()-gate shape as
// lib/webPush.js (test/webPush.test.js). No real vendor is wired in yet
// (see each module's own header comment), so what's tested here is the
// honest "not configured" contract every caller (lib/yf/systemPrompt.js,
// routes/concierge.js) depends on.
const test = require('node:test');
const assert = require('node:assert');

function freshRequire(path) {
  delete require.cache[require.resolve(path)];
  return require(path);
}

test('flightSearch.configured() is false with no provider/key set, true once both are', () => {
  delete process.env.FLIGHT_API_PROVIDER;
  delete process.env.FLIGHT_API_KEY;
  const flightSearch = freshRequire('../lib/flightSearch');
  assert.equal(flightSearch.configured(), false);

  process.env.FLIGHT_API_PROVIDER = 'kiwi';
  process.env.FLIGHT_API_KEY = 'test-key';
  const reconfigured = freshRequire('../lib/flightSearch');
  assert.equal(reconfigured.configured(), true);
  delete process.env.FLIGHT_API_PROVIDER;
  delete process.env.FLIGHT_API_KEY;
});

test('flightSearch.searchCheapest() returns an honest, clearly-illustrative empty result when not configured, rather than throwing or inventing a price', async () => {
  delete process.env.FLIGHT_API_PROVIDER;
  delete process.env.FLIGHT_API_KEY;
  const flightSearch = freshRequire('../lib/flightSearch');
  const result = await flightSearch.searchCheapest({ origin: 'Beirut', destination: 'Montreal' });
  assert.equal(result.illustrative, true);
  assert.deepEqual(result.estimates, []);
  assert.match(result.note, /not yet configured/);
});

test('flightSearch.searchCheapest() throws a clear, named-provider error when configured but unimplemented, rather than silently returning fake data', async () => {
  process.env.FLIGHT_API_PROVIDER = 'kiwi';
  process.env.FLIGHT_API_KEY = 'test-key';
  const flightSearch = freshRequire('../lib/flightSearch');
  await assert.rejects(() => flightSearch.searchCheapest({ origin: 'Beirut', destination: 'Montreal' }), /kiwi/);
  delete process.env.FLIGHT_API_PROVIDER;
  delete process.env.FLIGHT_API_KEY;
});

test('hotelSearch.configured() follows the same provider/key contract', () => {
  delete process.env.HOTEL_API_PROVIDER;
  delete process.env.HOTEL_API_KEY;
  const hotelSearch = freshRequire('../lib/hotelSearch');
  assert.equal(hotelSearch.configured(), false);
  process.env.HOTEL_API_PROVIDER = 'booking';
  process.env.HOTEL_API_KEY = 'test-key';
  assert.equal(freshRequire('../lib/hotelSearch').configured(), true);
  delete process.env.HOTEL_API_PROVIDER;
  delete process.env.HOTEL_API_KEY;
});

test('hotelSearch.search() returns an honest empty result when not configured', async () => {
  delete process.env.HOTEL_API_PROVIDER;
  delete process.env.HOTEL_API_KEY;
  const hotelSearch = freshRequire('../lib/hotelSearch');
  const result = await hotelSearch.search({ city: 'Dubai' });
  assert.equal(result.illustrative, true);
  assert.deepEqual(result.options, []);
});

test('translate.translate() returns illustrative:true with no translated text when not configured', async () => {
  delete process.env.TRANSLATE_API_PROVIDER;
  delete process.env.TRANSLATE_API_KEY;
  const translate = freshRequire('../lib/translate');
  const result = await translate.translate({ text: 'hello', targetLang: 'fr' });
  assert.equal(result.translated, null);
  assert.equal(result.illustrative, true);
});
