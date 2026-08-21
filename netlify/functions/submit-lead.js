exports.handler = async (event) => {
  const json = (statusCode, body) => ({
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (event.httpMethod !== 'POST') {
    return json(405, { success: false, error: 'Method not allowed' });
  }

  const apiKey = process.env.LOFTY_API_KEY;
  if (!apiKey) {
    console.log('LOFTY_API_KEY is not set');
    return json(500, { success: false, error: 'Lead submission is not configured.' });
  }

  let payload;
  try {
    const raw = event.body || '';
    const text = event.isBase64Encoded
      ? Buffer.from(raw, 'base64').toString('utf8')
      : raw;
    payload = JSON.parse(text);
  } catch (err) {
    return json(400, { success: false, error: 'Invalid request.' });
  }

  const lead = payload.lead && typeof payload.lead === 'object' ? payload.lead : payload;
  const fullName = lead.fullName || '';
  const email = lead.email || '';
  const phone = lead.phone || '';
  const message = lead.message || '';
  const source = payload.source || lead.source;
  const locationPreferences = lead.locationPreferences;
  const agentRoute = lead.agentRoute;
  const assignedAgent = lead.assignedAgent;

  const trimmed = String(fullName).trim();
  const spaceIdx = trimmed.indexOf(' ');
  const firstName = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
  const lastName = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();

  const notes = [
    message,
    agentRoute ? `Routed to: ${assignedAgent}` : null,
    locationPreferences?.length ? `Areas of interest: ${locationPreferences.join(', ')}` : null
  ].filter(Boolean).join('\n\n');

  const loftyBody = {
    firstName,
    lastName,
    email,
    phones: [{ number: phone }],
    source: source || 'Core Collective Website',
    notes
  };

  try {
    const loftyRes = await fetch('https://api.lofty.com/v1.0/leads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `token ${apiKey}`
      },
      body: JSON.stringify(loftyBody)
    });
    const loftyText = await loftyRes.text();
    console.log('Lofty response status:', loftyRes.status);
    console.log('Lofty response body:', loftyText);

    if (loftyRes.status >= 200 && loftyRes.status < 300) {
      return json(200, { success: true });
    }
    return json(502, { success: false, error: 'Unable to submit lead.' });
  } catch (err) {
    console.log('Lofty request failed:', err && err.message);
    return json(502, { success: false, error: 'Unable to submit lead.' });
  }
};
