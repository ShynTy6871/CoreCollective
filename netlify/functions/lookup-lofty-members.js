/**
 * lookup-lofty-members.js — ONE-TIME DIAGNOSTIC, not used by the site itself.
 * Once LOFTY_API_KEY and ADMIN_DEBUG_KEY are set in Netlify, visit:
 *   https://<your-site>.netlify.app/.netlify/functions/lookup-lofty-members?key=YOUR_DEBUG_KEY
 *
 * Lists every Lofty team member and their memberUserId, so each Core
 * Collective agent can be mapped to the ID Lofty needs for direct lead
 * assignment (see AGENT_LOFTY_IDS in submit-lead.js).
 */
const API_BASE = 'https://api.lofty.com/v1.0';

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

  const apiKey = process.env.LOFTY_API_KEY;
  if (!apiKey) {
    return json(200, { error: 'LOFTY_API_KEY is not set yet.' });
  }

  const headers = { Authorization: `token ${apiKey}` };
  const members = [];
  let offset = 0;
  const limit = 50;

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const url = `${API_BASE}/members?limit=${limit}&offset=${offset}`;
      const res = await fetch(url, { headers });
      const body = await res.json();
      if (res.status < 200 || res.status >= 300) {
        return json(200, { error: `Lofty returned status ${res.status}`, body });
      }
      const page = body.members || [];
      members.push(...page.map((m) => ({
        memberUserId: m.memberUserId,
        firstName: m.firstName,
        lastName: m.lastName,
        email: m.email
      })));
      const total = body.get_metadata && body.get_metadata.total;
      offset += limit;
      if (!page.length || (typeof total === 'number' && offset >= total) || offset > 500) break;
    }
    return json(200, { memberCount: members.length, members });
  } catch (err) {
    return json(200, { error: String(err) });
  }
};
