/**
 * lookup-agents.js — ONE-TIME DIAGNOSTIC, not used by the site itself.
 *
 * Once DOORIFY_BEARER_TOKEN is set in Netlify, visit:
 *   https://<your-site>.netlify.app/.netlify/functions/lookup-agents?key=YOUR_DEBUG_KEY
 * (set an ADMIN_DEBUG_KEY environment variable in Netlify too, any
 * random string, so this isn't wide open to the public internet)
 *
 * It queries Doorify's Member resource and returns any member records
 * whose license number matches the Core Collective team, PLUS a raw
 * sample Property record, so we can confirm:
 *   1. Doorify's Property records actually use "ListAgentMlsId" to
 *      store the license number (vs. some other field name)
 *   2. The five license numbers below are correct / current
 *
 * Paste the JSON output back to Claude and this can be deleted —
 * it's scaffolding, not a permanent part of the site.
 */

const API_BASE = 'https://api.sourceredb.com/odata';

const TEAM_LICENSES = ['331158', '334292', '331830', '308263', '309699'];

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
  const out = {};

  try {
    const licenseFilter = TEAM_LICENSES.map((l) => `MemberMlsId eq '${l}'`).join(' or ');
    const memberUrl = `${API_BASE}/Member?$filter=${encodeURIComponent(licenseFilter)}`;
    const memberRes = await fetch(memberUrl, { headers });
    out.memberLookup = {
      status: memberRes.status,
      body: memberRes.ok ? await memberRes.json() : await memberRes.text()
    };
  } catch (err) {
    out.memberLookup = { error: err.message };
  }

  try {
    const sampleUrl = `${API_BASE}/Property?$top=1&$select=ListingKey,ListAgentFullName,ListAgentMlsId,StandardStatus`;
    const sampleRes = await fetch(sampleUrl, { headers });
    out.samplePropertyRecord = {
      status: sampleRes.status,
      body: sampleRes.ok ? await sampleRes.json() : await sampleRes.text()
    };
  } catch (err) {
    out.samplePropertyRecord = { error: err.message };
  }

  return json(200, out);
};
