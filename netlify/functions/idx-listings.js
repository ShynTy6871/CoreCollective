/**
 * idx-listings.js
 *
 * Pulls Core Collective's own active/pending listings from Doorify MLS
 * (via the SourceRE RESO Web API) and returns them in the same shape the
 * homepage already expects from content/properties.json, so the existing
 * rendering code (mapCMSProperty / renderGrid in index.html) can display
 * them without any changes on that side.
 *
 * SECURITY: the bearer token lives ONLY in this server-side function via
 * the DOORIFY_BEARER_TOKEN environment variable (set in Netlify's site
 * settings). It is never sent to the browser. The browser only ever talks
 * to this function, never directly to api.sourceredb.com.
 *
 * COMPLIANCE: per the signed Data License Agreement with Triangle MLS
 * (Doorify MLS) dated 9/15/2026, listing display is only authorized at
 * the Use Location on file: https://www.corecollectivere.com. Do not
 * enable this feed's display on the site until that domain is live AND
 * the "Enable Live MLS Listings" setting is turned on in the admin panel
 * (content/site-settings.json). This function itself is harmless to
 * deploy dark — it just won't be called by the front end until then.
 *
 * Required IDX attribution, per Doorify MLS Rules & Regulations
 * (https://support.doorifymls.com/hc/en-us/articles/32402136977427),
 * is rendered by the front end alongside these listings, not here.
 */

const API_BASE = 'https://api.sourceredb.com/odata';

// Core Collective Real Estate team — Doorify's own internal MemberMlsId
// values (NOT the same as NC real estate license numbers — confirmed via
// the lookup-agents.js diagnostic on 9/20/2026). Only Marsha, Sharon, and
// Jennifer are active Doorify members — Dexter and Frederick are with
// Hive MLS instead, so they're intentionally left out of this list.
// `agentId` here matches each agent's `agent_id` in content/agents.json —
// it's how the front end knows which real team member to route a given
// listing's "Schedule a Showing" / contact actions to. Keep this in sync
// with content/agents.json if an agent_id ever changes.
const TEAM_AGENTS = [
  { mlsId: '104107', agentId: 'marsha-watson', name: 'Marsha Watson' },
  { mlsId: '103932', agentId: 'sharon-mcduffie', name: 'Sharon McDuffie' },
  { mlsId: '97433', agentId: 'jennifer-wiggins', name: 'Jennifer "Jenie" Wiggins' }
];

const SELECT_FIELDS = [
  'ListingKey',
  'ListPrice',
  'StandardStatus',
  'PropertyType',
  'PropertySubType',
  'UnparsedAddress',
  'StreetNumber',
  'StreetName',
  'StreetSuffix',
  'City',
  'StateOrProvince',
  'PostalCode',
  'BedroomsTotal',
  'BathroomsTotalInteger',
  'LivingArea',
  'PublicRemarks',
  'ListAgentFullName',
  'ListAgentMlsId',
  'ModificationTimestamp',
  'InternetEntireListingDisplayYN'
].join(',');

// Simple warm-lambda cache so repeat visits within a few minutes don't
// re-hit Doorify. Best-effort only — a cold start clears it. Doorify's
// own data only refreshes in 10-minute windows anyway (per their docs).
let cache = { at: 0, data: null };
const CACHE_MS = 10 * 60 * 1000;

function mapStatus(standardStatus) {
  const s = String(standardStatus || '').toLowerCase();
  if (s.includes('pending') || s.includes('under contract')) return 'pending';
  if (s.includes('coming')) return 'coming';
  if (s.includes('closed') || s.includes('sold')) return 'sold';
  return 'active';
}

function mapType(propertyType, propertySubType) {
  const t = String(propertyType || '').toLowerCase();
  const sub = String(propertySubType || '').toLowerCase();
  if (t.includes('commercial') || sub.includes('commercial')) return 'commercial';
  if (t.includes('land') || t.includes('farm') || t.includes('multi')) return 'investment';
  return 'residential';
}

function buildAddress(rec) {
  if (rec.UnparsedAddress) return rec.UnparsedAddress;
  return [rec.StreetNumber, rec.StreetName, rec.StreetSuffix].filter(Boolean).join(' ');
}

function buildCityState(rec) {
  return [rec.City, [rec.StateOrProvince, rec.PostalCode].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
}

function resizePhoto(mediaUrl, size) {
  if (!mediaUrl) return '';
  try {
    const u = new URL(mediaUrl);
    if (u.hostname === 'cdn.sourceredb.com') {
      u.hostname = 'cdn-resize.sourceredb.com';
      u.searchParams.set('class', size || 'medium');
      return u.toString();
    }
  } catch (err) {
    // fall through and return the original URL unmodified
  }
  return mediaUrl;
}

// Doorify's Media array isn't only photos — it also carries floor plans,
// virtual tour links, and documents, some of which can sort ahead of the
// real photos by Order. Anything whose MediaCategory clearly isn't a
// photo gets excluded here so the hero image and gallery can never end
// up pointing at a floor plan PDF or a broken non-image URL again. Media
// entries with no MediaCategory at all are kept (some feeds omit it).
const NON_PHOTO_MEDIA_CATEGORIES = [
  'document',
  'floor plan',
  'floorplan',
  'virtual tour',
  'branded virtual tour',
  'unbranded virtual tour',
  'video',
  'other'
];

function mapRecord(rec) {
  const media = Array.isArray(rec.Media) ? rec.Media : [];
  const photos = media
    .filter((m) => {
      if (!m || !m.MediaURL) return false;
      const category = String(m.MediaCategory || '').trim().toLowerCase();
      return !NON_PHOTO_MEDIA_CATEGORIES.includes(category);
    })
    .sort((a, b) => (Number(a.Order) || 0) - (Number(b.Order) || 0))
    .map((m) => resizePhoto(m.MediaURL, 'medium'));

  const agentMatch = TEAM_AGENTS.find((a) => a.mlsId === String(rec.ListAgentMlsId));

  return {
    id: 'idx-' + rec.ListingKey,
    source: 'idx',
    status: mapStatus(rec.StandardStatus),
    type: mapType(rec.PropertyType, rec.PropertySubType),
    price: Number(rec.ListPrice) || 0,
    address: buildAddress(rec),
    city_state: buildCityState(rec),
    beds: rec.BedroomsTotal == null ? null : Number(rec.BedroomsTotal),
    baths: rec.BathroomsTotalInteger == null ? null : Number(rec.BathroomsTotalInteger),
    sqft: rec.LivingArea == null ? null : Number(rec.LivingArea),
    photos,
    agent: rec.ListAgentFullName || (agentMatch && agentMatch.name) || '',
    // NEW: lets the front end route this listing's contact/schedule
    // actions directly to the real listing agent instead of a generic
    // form. Matches an agent_id in content/agents.json.
    agentId: agentMatch ? agentMatch.agentId : '',
    description: rec.PublicRemarks || '',
    modified: rec.ModificationTimestamp || null
  };
}

async function fetchListings(token) {
  const mlsIdFilter = TEAM_AGENTS.map((a) => `ListAgentMlsId eq '${a.mlsId}'`).join(' or ');
  const filter = [
    `(${mlsIdFilter})`,
    'InternetEntireListingDisplayYN eq true',
    "(StandardStatus eq 'Active' or StandardStatus eq 'Pending' or StandardStatus eq 'Coming Soon')"
  ].join(' and ');

  const url =
    `${API_BASE}/Property?` +
    `$filter=${encodeURIComponent(filter)}` +
    `&$select=${encodeURIComponent(SELECT_FIELDS)}` +
    `&$expand=${encodeURIComponent('Media')}` +
    `&$orderby=${encodeURIComponent('ModificationTimestamp desc')}` +
    `&$top=100`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Doorify API responded ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const records = Array.isArray(data.value) ? data.value : [];
  return records.map(mapRecord);
}

exports.handler = async () => {
  const json = (statusCode, body) => ({
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const token = process.env.DOORIFY_BEARER_TOKEN;
  if (!token) {
    console.log('DOORIFY_BEARER_TOKEN is not set');
    return json(200, { properties: [], configured: false });
  }

  if (cache.data && Date.now() - cache.at < CACHE_MS) {
    return json(200, { properties: cache.data, configured: true, cached: true });
  }

  try {
    const properties = await fetchListings(token);
    cache = { at: Date.now(), data: properties };
    return json(200, { properties, configured: true });
  } catch (err) {
    console.log('idx-listings fetch failed:', err && err.message);
    return json(200, { properties: [], configured: true, error: true });
  }
};
