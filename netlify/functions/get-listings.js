/**
 * get-listings.js
 *
 * Public North Carolina listings from the Doorify MLS feed (SourceRE RESO
 * Web API), as a JSON array. Two modes:
 *
 *   GET /.netlify/functions/get-listings
 *       The newest 100 listings, for the Property Search page and the
 *       homepage. Lightweight: one primary photo per listing, no description.
 *
 *   GET /.netlify/functions/get-listings?listing=<ListingKey>
 *       Just that one listing (works for listings outside the newest 100),
 *       with everything the listing detail page needs: the full photo list,
 *       the description (PublicRemarks), and the listing office
 *       (ListOfficeName / Phone / Email) for MLS attribution.
 *
 * SECURITY: the bearer token is read from DOORIFY_BEARER_TOKEN (Netlify
 * environment variable) and only ever used server-side. The browser talks
 * to this function, never to api.sourceredb.com.
 *
 * COMPLIANCE: listings are filtered to InternetEntireListingDisplayYN eq
 * true on the API side, and re-checked on every record below, so listings
 * not permitted for public internet display can never be returned.
 *
 * RATE LIMITS: SourceRE allows 3 requests/second and 5,000/hour. Photos
 * are therefore requested in the SAME call as the listings ($expand=Media)
 * rather than one Media request per listing, and results are cached in
 * memory for 10 minutes. (The full photo list is only returned in the
 * single-listing mode so the 100-listing response stays small.)
 *
 * Success:  200 + JSON array of listings
 * Failure:  4xx/5xx + { "error": "<friendly message>" }
 */

const { listPhotos } = require('./lib/media');
const { isRental, NOT_RENTAL_FILTERS } = require('./lib/rentals');

const API_BASE = 'https://api.sourceredb.com/odata';
const CACHE_MS = 10 * 60 * 1000;
const PHOTO_SIZE = 'medium'; // SourceRE resize class: small | medium | large

const BASE_FIELDS = [
  'ListingKey',
  'ListPrice',
  'PropertyType',
  'PropertySubType', // only used to screen out rentals; not returned
  'UnparsedAddress',
  'City',
  'StateOrProvince',
  'PostalCode',
  'BedroomsTotal',
  'BathroomsTotalInteger',
  'StandardStatus',
  'APIModificationTimestamp',
  'InternetEntireListingDisplayYN'
];
const LIST_SELECT = BASE_FIELDS.join(',');

// Single-listing mode asks for more. PublicRemarks is known to work (the
// team feed uses it). The listing-office fields are standard RESO names; if
// the feed rejects them the lookup retries without them rather than failing.
const DETAIL_SELECT_FULL = BASE_FIELDS.concat([
  'PublicRemarks',
  'ListOfficeName',
  'ListOfficePhone',
  'ListOfficeEmail'
]).join(',');
const DETAIL_SELECT_FALLBACK = BASE_FIELDS.concat(['PublicRemarks']).join(',');

// Warm-lambda, in-memory caches. A cold start clears them, which is fine.
let cache = { at: 0, data: null };
const keyCache = new Map(); // ListingKey -> { at, data }
const KEY_CACHE_MAX = 100;

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}

function json200(listings) {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300'
    },
    body: JSON.stringify(listings)
  };
}

function numberOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// UnparsedAddress is sometimes just the street and sometimes the whole
// address. Return a full "street, city, ST zip" string either way.
function fullAddress(rec) {
  const street = String(rec.UnparsedAddress || '').trim();
  const cityStateZip = [
    rec.City,
    [rec.StateOrProvince, rec.PostalCode].filter(Boolean).join(' ')
  ]
    .filter(Boolean)
    .join(', ');
  if (!street) return cityStateZip;
  if (rec.City && street.toLowerCase().includes(String(rec.City).toLowerCase())) return street;
  return [street, cityStateZip].filter(Boolean).join(', ');
}

function mapRecord(rec, detail) {
  const photos = listPhotos(rec.Media, PHOTO_SIZE); // shared rules, see lib/media.js
  const out = {
    id: rec.ListingKey,
    price: numberOrNull(rec.ListPrice),
    propertyType: rec.PropertyType || '',
    address: fullAddress(rec),
    city: rec.City || '',
    state: rec.StateOrProvince || '',
    postalCode: rec.PostalCode || '',
    beds: numberOrNull(rec.BedroomsTotal),
    baths: numberOrNull(rec.BathroomsTotalInteger),
    status: rec.StandardStatus || '',
    modified: rec.APIModificationTimestamp || null,
    photo: photos[0] || ''
  };
  if (detail) {
    out.photos = photos;
    out.description = rec.PublicRemarks || '';
    out.listOfficeName = rec.ListOfficeName || '';
    out.listOfficePhone = rec.ListOfficePhone || '';
    out.listOfficeEmail = rec.ListOfficeEmail || '';
  }
  return out;
}

async function queryProperty(token, filter, select, top) {
  const url =
    `${API_BASE}/Property?` +
    `$filter=${encodeURIComponent(filter)}` +
    `&$select=${encodeURIComponent(select)}` +
    `&$expand=${encodeURIComponent('Media')}` +
    `&$orderby=${encodeURIComponent('APIModificationTimestamp desc')}` +
    `&$top=${top}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`SourceRE API responded ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  return Array.isArray(data.value) ? data.value : [];
}

function visibilityFilter() {
  return [
    "StateOrProvince eq 'NC'",
    'InternetEntireListingDisplayYN eq true',
    // Buyers only need listings that are actually on the market.
    "(StandardStatus eq 'Active' or StandardStatus eq 'Pending' or StandardStatus eq 'Coming Soon')"
  ].concat(NOT_RENTAL_FILTERS); // no rentals / leases (also re-checked per record below)
}

// The newest 100 listings (lightweight shape).
async function fetchListings(token) {
  const records = await queryProperty(token, visibilityFilter().join(' and '), LIST_SELECT, 100);
  return records
    .filter((rec) => rec && rec.InternetEntireListingDisplayYN === true && !isRental(rec)) // belt and suspenders
    .map((rec) => mapRecord(rec, false));
}

// One listing, with photos / description / listing office. listingKey is
// validated by the caller before it reaches the OData filter.
async function fetchOneListing(token, listingKey) {
  const filter = visibilityFilter().concat([`ListingKey eq '${listingKey}'`]).join(' and ');
  let records;
  try {
    records = await queryProperty(token, filter, DETAIL_SELECT_FULL, 1);
  } catch (err) {
    if (err.status !== 400) throw err;
    // A field name (most likely a listing-office one) was rejected: log it and
    // retry without the office fields so the listing still opens.
    console.log('get-listings: detail select rejected, retrying without office fields:', err.message);
    records = await queryProperty(token, filter, DETAIL_SELECT_FALLBACK, 1);
  }
  return records
    .filter((rec) => rec && rec.InternetEntireListingDisplayYN === true && !isRental(rec))
    .map((rec) => mapRecord(rec, true));
}

async function handleSingle(token, key) {
  const cached = keyCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return json200(cached.data);
  try {
    const listings = await fetchOneListing(token, key);
    if (keyCache.size >= KEY_CACHE_MAX) keyCache.delete(keyCache.keys().next().value);
    keyCache.set(key, { at: Date.now(), data: listings });
    return json200(listings); // [] when not found / not displayable
  } catch (err) {
    console.log('get-listings: single lookup failed:', err && err.message);
    if (cached) return json200(cached.data);
    return json(502, { error: 'We could not load that listing right now. Please try again in a few minutes.' });
  }
}

exports.handler = async (event) => {
  const token = process.env.DOORIFY_BEARER_TOKEN;
  if (!token) {
    console.log('get-listings: DOORIFY_BEARER_TOKEN is not set');
    return json(500, { error: 'Listings are not configured yet. Please check back soon.' });
  }

  const key = event && event.queryStringParameters && event.queryStringParameters.listing;
  if (key !== undefined && key !== null && key !== '') {
    // ListingKeys are simple tokens; reject anything else (it goes into an OData filter).
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(key)) return json(400, { error: 'Invalid listing id.' });
    return handleSingle(token, key);
  }

  if (cache.data && Date.now() - cache.at < CACHE_MS) {
    return json200(cache.data);
  }

  try {
    const listings = await fetchListings(token);
    cache = { at: Date.now(), data: listings };
    return json200(listings);
  } catch (err) {
    console.log('get-listings: fetch failed:', err && err.message);
    // If we have an older successful response, serve it rather than nothing.
    if (cache.data) return json200(cache.data);
    return json(502, { error: 'We could not load listings right now. Please try again in a few minutes.' });
  }
};
