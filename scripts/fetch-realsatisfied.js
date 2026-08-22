#!/usr/bin/env node
'use strict';

/**
 * Import RealSatisfied agent RSS reviews into content/testimonials.json.
 * New entries are pending_approval and skipped if source_guid already exists.
 */

const fs = require('fs');
const https = require('https');
const path = require('path');

const TESTIMONIALS_PATH = path.join(__dirname, '..', 'content', 'testimonials.json');
const FEED_URL = (vanityKey) => `https://rss.realsatisfied.com/rss/agent/${vanityKey}`;

const AGENTS = [
  { agent_id: 'marsha-watson', vanity_key: 'Marsha-Watson' },
  { agent_id: 'sharon-mcduffie', vanity_key: 'Sharon-McDuffie' },
  { agent_id: 'sylvia-wheeler', vanity_key: 'Sylvia-Wheeler' },
  { agent_id: 'frederick-davis', vanity_key: 'Frederick-Davis' },
  { agent_id: 'dexter-drayton', vanity_key: 'Dexter-Drayton' },
  { agent_id: 'jennifer-wiggins', vanity_key: 'Jennifer-Wiggins' },
];

function fetchXml(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'CoreCollective-RealSatisfied-Importer/1.0',
          Accept: 'application/rss+xml, application/xml, text/xml, */*',
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const next = new URL(res.headers.location, url).toString();
          fetchXml(next).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      }
    );
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error(`Timeout fetching ${url}`)));
  });
}

function decodeXml(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
    .trim();
}

function extractTag(xml, tagName) {
  const re = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`, 'i');
  const match = xml.match(re);
  return match ? decodeXml(match[1]) : '';
}

function extractItems(xml) {
  const items = [];
  const re = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = re.exec(xml))) items.push(match[1]);
  return items;
}

function parseTitle(title) {
  const text = String(title || '').trim();
  const comma = text.indexOf(',');
  if (comma === -1) return { name: text, location: '' };
  return {
    name: text.slice(0, comma).trim(),
    location: text.slice(comma + 1).trim(),
  };
}

function initialsFromName(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z]/g, '').charAt(0).toUpperCase())
    .filter(Boolean)
    .join('');
}

function starsFromSatisfaction(value) {
  const n = Number(value);
  const raw = Number.isFinite(n) ? Math.round((n / 100) * 5) : 1;
  return Math.min(5, Math.max(1, raw));
}

function readTestimonials() {
  try {
    const data = JSON.parse(fs.readFileSync(TESTIMONIALS_PATH, 'utf8'));
    if (!data || !Array.isArray(data.testimonials)) return { testimonials: [] };
    return data;
  } catch {
    return { testimonials: [] };
  }
}

async function importAgent(agent, existingGuids) {
  const xml = await fetchXml(FEED_URL(agent.vanity_key));
  const channelXml = xml.split(/<item\b/i)[0] || xml;
  const stars = starsFromSatisfaction(extractTag(channelXml, 'realsatisfied:overall_satisfaction'));
  const stats = { added: 0, duplicates: 0, empty: 0 };
  const entries = [];

  for (const itemXml of extractItems(xml)) {
    const quote = extractTag(itemXml, 'description');
    const guid = extractTag(itemXml, 'guid');
    if (!quote) {
      stats.empty += 1;
      continue;
    }
    if (!guid || existingGuids.has(guid)) {
      stats.duplicates += 1;
      continue;
    }

    const { name, location } = parseTitle(extractTag(itemXml, 'title'));
    existingGuids.add(guid);
    stats.added += 1;
    entries.push({
      quote,
      client_name: name,
      location,
      initials: initialsFromName(name),
      stars,
      pending_approval: false,
      source: 'RealSatisfied',
      source_guid: guid,
      agent_id: agent.agent_id,
    });
  }

  return { stats, entries };
}

async function main() {
  const data = readTestimonials();
  const existingGuids = new Set(
    data.testimonials.map((t) => t && t.source_guid).filter(Boolean)
  );

  console.log('RealSatisfied import');

  for (const agent of AGENTS) {
    try {
      const { stats, entries } = await importAgent(agent, existingGuids);
      data.testimonials.push(...entries);
      console.log(
        `  ${agent.agent_id}: added ${stats.added}, skipped ${stats.duplicates} duplicate(s), skipped ${stats.empty} empty`
      );
    } catch (err) {
      console.error(`  ${agent.agent_id}: failed — ${err.message}`);
    }
  }

  fs.writeFileSync(TESTIMONIALS_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(`Done. ${data.testimonials.length} total testimonial(s) in ${path.relative(process.cwd(), TESTIMONIALS_PATH)}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
