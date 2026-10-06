/**
 * get-listings.js
 *
 * Returns the first page (100) of public North Carolina listings from the
 * Doorify MLS feed (SourceRE RESO Web API) as a JSON array, for the
 * Property Search page (property-search.html).
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
 * rather than one Media request per listing (which would be 100 extra
 * calls per refresh), and the result is cached in memory for 10 minutes.
 *
 * Success:  200 + JSON array of listings
 * Failure:  4xx/5xx + { "error": "<friendly message>" }
 */

const API_BASE = 'https://api.sourceredb.com/odata';
const CACHE_MS = 10 * 60 * 1000;
const PHOTO_SIZE = 'medium'; // SourceRE resize class: small | medium | large

const SELECT_FIELDS = [
  'ListingKey',
  'ListPrice',
  'PropertyType',
  'UnparsedAddress',
  'City',
  'StateOrProvince',
  'PostalCode',
  'BedroomsTotal',
  'BathroomsTotalInteger',
  'StandardStatus',
  'APIModificationTimestamp',
  'InternetEntireListingDisplayYN'
].join(',');

// Warm-lambda, in-memory cache. A cold start clears it, which is fine.
let cache = { at: 0, data: null };

// Doorify's Media array also carries floor plans, tours, and documents.
// Never pick one of those as the card photo.
const NON_PHOTO_CATEGORIES = [
  'document',
  'floor plan',
  'floorplan',
  'virtual tour',
  'branded virtual tour',
  'unbranded virtual tour',
  'video',
  'other'
];

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}

// Original photos live on cdn.sourceredb.com; the resize CDN serves the
// small/medium/large size classes.
function sizedPhotoUrl(mediaUrl) {
  if (!mediaUrl) return '';
  try {
    const u = new URL(mediaUrl);
    if (u.hostname === 'cdn.sourceredb.com') {
      u.hostname = 'cdn-resize.sourceredb.com';
      u.searchParams.set('class', PHOTO_SIZE);
      return u.toString();
    }
  } catch (err) {
    // fall through and return the original URL
  }
  return mediaUrl;
}

function primaryPhoto(media) {
  const photos = (Array.isArray(media) ? media : [])
    .filter((m) => {
      if (!m || !m.MediaURL) return false;
      const category = String(m.MediaCategory || '').trim().toLowerCase();
      return !NON_PHOTO_CATEGORIES.includes(category);
    })
    .sort((a, b) => {
      // PreferredPhotoYN wins if the feed provides it, then lowest Order.
      const pa = a.PreferredPhotoYN ? 0 : 1;
      const pb = b.PreferredPhotoYN ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return (Number(a.Order) || 0) - (Number(b.Order) || 0);
    });
  return photos.length ? sizedPhotoUrl(photos[0].MediaURL) : '';
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

function mapRecord(rec) {
  return {
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
    photo: primaryPhoto(rec.Media)
  };
}

async function fetchListings(token) {
  const filter = [
    "StateOrProvince eq 'NC'",
    'InternetEntireListingDisplayYN eq true',
    // Buyers only need listings that are actually on the market.
    "(StandardStatus eq 'Active' or StandardStatus eq 'Pending' or StandardStatus eq 'Coming Soon')"
  ].join(' and ');

  const url =
    `${API_BASE}/Property?` +
    `$filter=${encodeURIComponent(filter)}` +
    `&$select=${encodeURIComponent(SELECT_FIELDS)}` +
    `&$expand=${encodeURIComponent('Media')}` +
    `&$orderby=${encodeURIComponent('APIModificationTimestamp desc')}` +
    '&$top=100';

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`SourceRE API responded ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const records = Array.isArray(data.value) ? data.value : [];
  return records
    .filter((rec) => rec && rec.InternetEntireListingDisplayYN === true) // belt and suspenders
    .map(mapRecord);
}

exports.handler = async () => {
  const token = process.env.DOORIFY_BEARER_TOKEN;
  if (!token) {
    console.log('get-listings: DOORIFY_BEARER_TOKEN is not set');
    return json(500, { error: 'Listings are not configured yet. Please check back soon.' });
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
