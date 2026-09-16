'use strict';

// Cheapest-flight lookup -- thin wrapper around a real flight-search API,
// same house pattern as lib/webPush.js/lib/paypal.js/lib/stripe.js: nothing
// else in the codebase touches the vendor's HTTP shape directly, so swapping
// providers later (or adding a second one) never means chasing callers.
//
// NOT WIRED TO A REAL VENDOR YET -- this is the open item flagged in the
// "Yalla Nsafer — Platform Summary" build brief (Section 5, "concept-stage").
// Picking a real API (candidates: Kiwi/Tequila, Amadeus Self-Service, or
// Skyscanner's partner API) is a business decision (pricing tier, which
// markets it actually covers well for MENA/GCC routes) that needs Hicham's
// sign-off before Devin wires real credentials -- see FLIGHT_API_PROVIDER
// below. Until then, configured() is false and the mock provider returns
// clearly-labeled illustrative data ONLY, never presented as a live, bookable
// price -- see lib/yf/systemPrompt.js's TRAVEL_CONTEXT block, which states
// this explicitly to the model so it can never be talked into presenting a
// mock figure as real (same "retrieve, don't recall" discipline as JOB_CONTEXT).

const PROVIDER = process.env.FLIGHT_API_PROVIDER || ''; // e.g. 'kiwi' | 'amadeus' -- unset until a vendor is chosen
const API_KEY = process.env.FLIGHT_API_KEY || '';

const configured = () => Boolean(PROVIDER && API_KEY);

// origin/destination: IATA-ish free text (city or airport name) -- a real
// provider integration would resolve these to airport codes itself.
// dateRange: { earliest, latest } ISO date strings, both optional.
// Returns { estimates: [{ route, priceNote, note }], illustrative: boolean }.
// illustrative:true means "not a live quote" -- always true until a real
// provider is wired in below.
async function searchCheapest({ origin, destination, dateRange } = {}) {
  if (!configured()) {
    return {
      illustrative: true,
      estimates: [],
      note: 'Flight search is not yet configured on this platform -- no real fare data is available.',
    };
  }
  // Real-provider call goes here once PROVIDER/API_KEY are set -- e.g.
  //   if (PROVIDER === 'kiwi') return searchKiwi({ origin, destination, dateRange });
  // Left unimplemented on purpose: which vendor to call is exactly the open
  // decision this module's header comment describes, not something to guess
  // at with a placeholder integration that would look done but isn't real.
  throw new Error(`flightSearch: FLIGHT_API_PROVIDER=${PROVIDER} has no implementation wired in yet`);
}

module.exports = { configured, searchCheapest };
