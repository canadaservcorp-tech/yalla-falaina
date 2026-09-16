'use strict';

// Accommodation-comparison lookup (hotel / Airbnb / long-term apartment) --
// same thin-wrapper-around-a-real-vendor shape as lib/flightSearch.js, and
// the same NOT WIRED TO A REAL VENDOR YET status: candidates are Booking.com's
// affiliate/partner API, an Airbnb-data aggregator (Airbnb has no public
// booking API — this would be a third-party data provider), and a
// RapidAPI-hosted hotel-search API as a faster-to-integrate fallback. Vendor
// choice needs Hicham's sign-off (cost, coverage of the actual GCC/Western
// cities Yalla Nsafer's seekers land in) before Devin wires real credentials.
//
// Couch-surfing and roommate/shared-accommodation matching is NOT part of
// this module -- that's user-generated content, not a paid vendor API, and
// is already fully implemented: see lib/yf/accommodationMatching.js and the
// accommodation_listings/accommodation_submissions tables in schema.sql.

const PROVIDER = process.env.HOTEL_API_PROVIDER || ''; // e.g. 'booking' | 'rapidapi_hotels' -- unset until a vendor is chosen
const API_KEY = process.env.HOTEL_API_KEY || '';

const configured = () => Boolean(PROVIDER && API_KEY);

// city: free text. budget: optional { max, currency }. dates: optional
// { checkIn, checkOut } ISO date strings.
// Returns { illustrative: boolean, options: [...], note }, same shape
// discipline as lib/flightSearch.js's searchCheapest -- illustrative:true
// until a real provider is wired in.
async function search({ city, budget, dates } = {}) {
  if (!configured()) {
    return {
      illustrative: true,
      options: [],
      note: 'Accommodation price search is not yet configured on this platform -- no real listing data is available.',
    };
  }
  // Real-provider call goes here once PROVIDER/API_KEY are set. Left
  // unimplemented on purpose -- see this module's header comment.
  throw new Error(`hotelSearch: HOTEL_API_PROVIDER=${PROVIDER} has no implementation wired in yet`);
}

module.exports = { configured, search };
