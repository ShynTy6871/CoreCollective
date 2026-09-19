/**
 * lookup-agents.js — ONE-TIME DIAGNOSTIC, not used by the site itself.
 * Once DOORIFY_BEARER_TOKEN is set in Netlify, visit:
 *   https://<your-site>.netlify.app/.netlify/functions/lookup-agents?key=YOUR_DEBUG_KEY
 * (ADMIN_DEBUG_KEY environment variable must be set in Netlify too)
 */
const API_BASE = 'https://api.sourceredb.com/odata';

// Core Collective team members, searched by name since we don't yet know
// their Doorify-internal MemberMlsId numbers (these are NOT the same as
// NC real estate license numbers).
const TEAM_NAMES = [
  { first: 'Marsha', last: 'Watson' },
  { first: 'Dexter', last: 'Drayton' },
  { first: 'Sharon', last: 'McDuffie' },
  { first: 'Jennifer', last: 'Wiggins' },
  { first: 'Frederick', last: 'Davis' },
  { first: 'Sylvia', last: 'Wheeler' }
];

exports.handler = async (event) => {
  const json = (statusCode, body) => ({
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body, null, 2)
  });

  const debugKey = process.env.ADMIN_DEBUG_KEY;
  const providedKey = (event.queryStringParameters || {}).key;
  if (!debugKey || providedKey !== debugKey) {
    return json(404, { error: 'Not found.' });
  }

  const token = process.env.DOORIFY_BEARER_TOKEN;
  if (!token) {
    return json(200, { error: 'DOORIFY_BEARER_TOKEN is not set yet.' });
  }

  const headers = { Authorization: `Bearer ${token}` };
  const out = { nameLookupResults: [] };

  for (const person of TEAM_NAMES) {
    const filter = `MemberFirstName eq '${person.first}' and MemberLastName eq '${person.last}'`;
    const select = 'MemberKey,MemberMlsId,MemberFirstName,MemberLastName,MemberStateLicense,OfficeName,MemberStatus';
    const url = `${API_BASE}/Member?$filter=${encodeURIComponent(filter)}&$select=${encodeURIComponent(select)}`;
    try {
      const res = await fetch(url, { headers });
      const body = await res.json();
      out.nameLookupResults.push({
        searched: `${person.first} ${person.last}`,
        status: res.status,
        found: body.value || body
      });
    } catch (err) {
      out.nameLookupResults.push({
        searched: `${person.first} ${person.last}`,
        error: String(err)
      });
    }
  }

  return json(200, out);
};
