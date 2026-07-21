#!/usr/bin/env node
'use strict';

/**
 * Weekly Eastern NC regional content draft generator (130-mile Raleigh radius).
 * Produces two blog drafts: Regional Events + Market Briefing.
 *
 * Optional env:
 *   EVENTBRITE_TOKEN — Eventbrite listings per hub
 *   OPENAI_API_KEY   — AI-enhanced market/heritage copy (falls back to editorial templates)
 */

const fs = require('fs');
const path = require('path');

const BLOG_PATH = path.join(__dirname, '..', 'content', 'blog.json');
const AUTHOR = 'Core Collective Editorial';
const USER_AGENT = 'CoreCollective-RegionalBot/2.0 (+https://corecollective.com)';

const EVENTS_TITLE = 'The Regional Edit: Events Across the Triangle, Sandhills & Coast';
const MARKET_TITLE = 'Eastern NC & Triangle Regional Market Briefing';

const COVERS = {
  events: {
    image: 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=800&q=80',
    alt: 'Community gathering along the North Carolina coast and piedmont',
  },
  market: {
    image: 'https://images.unsplash.com/photo-1486325212027-8081e485255e?w=800&q=80',
    alt: 'Eastern North Carolina regional skyline and growth corridors',
  },
};

/** Core hubs within ~130 miles of Raleigh */
const REGIONAL_HUBS = [
  { id: 'triangle', label: 'Raleigh-Durham Metro', zone: 'central', keywords: ['raleigh', 'durham', 'cary', 'apex', 'chapel hill', 'morrisville', 'north hills', 'midtown', 'research triangle', 'wake forest'] },
  { id: 'fayetteville', label: 'Fayetteville (Fort Liberty)', zone: 'military', keywords: ['fayetteville', 'fort liberty', 'fort bragg', 'cumberland'] },
  { id: 'goldsboro', label: 'Goldsboro (Seymour Johnson AFB)', zone: 'military', keywords: ['goldsboro', 'seymour johnson', 'wayne county'] },
  { id: 'jacksonville', label: 'Jacksonville (Camp Lejeune)', zone: 'military', keywords: ['jacksonville', 'camp lejeune', 'onslow'] },
  { id: 'wilmington', label: 'Wilmington', zone: 'coastal', keywords: ['wilmington', 'wrightsville', 'carolina beach', 'new hanover'] },
  { id: 'newbern', label: 'New Bern', zone: 'coastal', keywords: ['new bern', 'newbern', 'craven'] },
  { id: 'morehead', label: 'Morehead City', zone: 'coastal', keywords: ['morehead city', 'morehead', 'beaufort nc', 'carteret'] },
  { id: 'emerald', label: 'Emerald Isle', zone: 'coastal', keywords: ['emerald isle', 'bogue banks', 'atlantic beach', 'pine knoll'] },
];

const RSS_FEEDS = [
  { name: 'Visit Raleigh', url: 'https://www.visitraleigh.com/event/rss/', hub: 'triangle' },
  { name: 'Durham Community Calendar', url: 'https://www.durhamnc.gov/RSS.aspx?CID=23', hub: 'triangle' },
  { name: 'Durham Parks & Recreation', url: 'https://www.dprplaymore.org/RSS.aspx?CID=14', hub: 'triangle' },
];

const HERITAGE_GEMS = [
  {
    region: 'Goldsboro & Seymour Johnson AFB',
    fact: 'Goldsboro\'s aviation legacy began when Seymour Johnson Field opened in 1942. Re-established as a permanent Air Force base in 1956, it now hosts the 4th Fighter Wing and remains one of Eastern NC\'s largest economic engines — a hidden gem for defense-adjacent professionals seeking Sandhills affordability.',
  },
  {
    region: 'New Bern',
    fact: 'Founded in 1710, New Bern was North Carolina\'s first permanent capital and one of America\'s earliest planned cities. Its Neuse and Trent riverfront supported colonial shipbuilding and trade — today the historic district offers walkable charm that coastal buyers often discover only after touring Wilmington alternatives.',
  },
  {
    region: 'Fayetteville & Fort Liberty',
    fact: 'Fort Liberty (formerly Fort Bragg) traces its roots to 1918 Camp Bragg and evolved into the world\'s largest military installation by population. The post\'s 2023 redesignation reflects a broader mission set while Fayetteville\'s downtown reinvestment continues to reshape off-base luxury and executive housing demand.',
  },
  {
    region: 'Jacksonville & Camp Lejeune',
    fact: 'Camp Lejeune, established in 1941, anchors Onslow County\'s identity as a Marine Corps powerhouse. Jacksonville\'s rapid growth along US-17 and the NC-24 corridor creates a distinct PCS-driven market where newer construction and coastal access within 45 minutes attract military families extending tours.',
  },
  {
    region: 'Wilmington River District',
    fact: 'Wilmington\'s 19th-century cotton and naval stores trade built one of the South\'s busiest antebellum ports. The preserved Riverwalk and Cotton Exchange district — listed on the National Register — remains a lifestyle magnet for luxury buyers balancing Cape Fear boating culture with I-40 Triangle connectivity.',
  },
  {
    region: 'Morehead City & Beaufort',
    fact: 'Morehead City\'s deep-water port, completed in the 1850s, transformed Carteret County into a commercial fishing and maritime hub. Beaufort\'s adjacent historic village — among NC\'s oldest towns — offers a quieter coastal alternative to Emerald Isle\'s vacation-home velocity.',
  },
  {
    region: 'Smithfield & Johnston County',
    fact: 'Smithfield flourished as a Johnston County rail and agricultural crossroads in the late 1800s, linking Raleigh markets to coastal supply chains along what is now US-70. The corridor\'s I-42 designation signals long-term commuter growth for buyers priced out of Wake County.',
  },
  {
    region: 'Emerald Isle & Bogue Banks',
    fact: 'Emerald Isle was developed in the 1950s when seven miles of Bogue Banks barrier island were assembled into a planned beach community. Its strict building codes and limited supply preserve oceanfront character — a hidden gem for second-home investors watching Wilmington and Outer Banks pricing climb.',
  },
];

const DEFENSE_SPOTLIGHTS = [
  {
    region: 'Goldsboro / Seymour Johnson AFB',
    body: 'Wayne County continues to see steady PCS-adjacent demand as Air Combat Command families prioritize school districts and housing stock within 20 minutes of base gates. Median price points remain materially below Wake County while offering direct US-70 access toward Raleigh and the coast.',
  },
  {
    region: 'Fayetteville / Fort Liberty',
    body: 'Fort Liberty\'s evolution under the 2023 redesignation has renewed interest in Cumberland County executive rentals and luxury new construction in neighborhoods like Arrington and Kings Grant. Off-base buyers increasingly weigh Fayetteville\'s affordability against Raleigh commute feasibility via I-95 and US-401.',
  },
  {
    region: 'Jacksonville / Camp Lejeune',
    body: 'Onslow County\'s PCS cycles drive consistent turnover in the $350K–$550K bracket, with newer subdivisions west of Jacksonville capturing Marine families seeking yard space and garage capacity. Coastal day-trip proximity to Emerald Isle adds lifestyle premium without full barrier-island pricing.',
  },
  {
    region: 'New Bern / Riverfront Commerce',
    body: 'New Bern\'s historic riverfront and Tryon Palace district anchor a retiree and remote-worker influx distinct from Wilmington\'s university and film-industry profile. Luxury inventory along the Trent River trades at a discount to Cape Fear equivalents while offering deep-water and marina access.',
  },
  {
    region: 'I-40 / US-70 / I-95 Commute Corridors',
    body: 'Johnston County (Smithfield, Clayton) and Wayne County (Goldsboro) benefit from I-42 and US-70 widening narratives that shorten effective Raleigh commutes. Defense-sector and RTP remote workers increasingly map "90-minute lifestyle" searches across this 130-mile arc rather than limiting to Wake County.',
  },
  {
    region: 'Wilmington / Cape Fear Investment',
    body: 'Wilmington\'s luxury segment remains supply-constrained along Wrightsville Beach and Landfall, while inland executive homes in Porter\'s Neck and Brunswick County capture coastal investment demand at lower basis. I-40 completion psychology continues to pull Triangle equity into Cape Fear markets.',
  },
];

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/xml, text/xml, */*' },
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function extractTag(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|<([^<]*))<\\/${tag}>`, 'i');
  const match = block.match(re);
  if (!match) return '';
  return (match[1] || match[2] || '').trim();
}

function parseRssItems(xml) {
  const items = [];
  const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const categories = [];
    const catRegex = /<category(?:\s[^>]*)?>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))<\/category>/gi;
    let catMatch;
    while ((catMatch = catRegex.exec(block)) !== null) {
      categories.push((catMatch[1] || catMatch[2] || '').trim());
    }
    items.push({
      title: extractTag(block, 'title'),
      link: extractTag(block, 'link'),
      description: extractTag(block, 'description'),
      pubDate: extractTag(block, 'pubDate'),
      categories,
    });
  }
  return items.filter((item) => item.title);
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseUsDate(str) {
  const m = String(str).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const date = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseEventWindow(description, pubDate) {
  const text = stripHtml(description);
  const range = text.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*(?:to|-)\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  if (range) return { start: parseUsDate(range[1]), end: parseUsDate(range[2]) };
  const single = text.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
  if (single) {
    const d = parseUsDate(single[1]);
    return d ? { start: d, end: d } : null;
  }
  const parsed = pubDate ? new Date(pubDate) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) return { start: parsed, end: parsed };
  return null;
}

function overlapsWeek(window, weekStart, weekEnd) {
  if (!window?.start || !window?.end) return true;
  return window.start <= weekEnd && window.end >= weekStart;
}

function getWeekRange(baseDate = new Date()) {
  const d = new Date(baseDate);
  const day = d.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diffToMon);
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  return { mon, sun };
}

function formatWeekTitle(mon) {
  return mon.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function getWeekIndex(mon) {
  return Math.floor(mon.getTime() / (7 * 24 * 60 * 60 * 1000));
}

function pickRotating(pool, weekIndex) {
  return pool[weekIndex % pool.length];
}

function classifyEventHub(event) {
  const hay = `${event.title} ${stripHtml(event.description)} ${event.hubLabel || ''} ${event.region || ''} ${(event.categories || []).join(' ')}`.toLowerCase();
  for (const hub of REGIONAL_HUBS) {
    if (hub.keywords.some((kw) => hay.includes(kw))) return hub;
  }
  const feedHub = REGIONAL_HUBS.find((h) => h.id === event.hubId);
  if (feedHub) return feedHub;
  return REGIONAL_HUBS[0];
}

function formatEventDate(window) {
  if (!window?.start) return 'Date TBA';
  const opts = { weekday: 'short', month: 'short', day: 'numeric' };
  const start = window.start.toLocaleDateString('en-US', opts);
  if (!window.end || window.end.toDateString() === window.start.toDateString()) return start;
  return `${start} – ${window.end.toLocaleDateString('en-US', opts)}`;
}

function dedupeEvents(events) {
  const seen = new Set();
  return events.filter((event) => {
    const key = event.title.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scoreEvent(event) {
  const hay = `${event.title} ${stripHtml(event.description)}`.toLowerCase();
  let score = 0;
  if (hay.includes('free')) score += 2;
  if (/festival|concert|market|fair|parade|gala|tasting/i.test(hay)) score += 2;
  if (event.categories?.some((c) => /arts|music|food|family|outdoor/i.test(c))) score += 1;
  return score;
}

function curateRegionalEvents(events, weekStart, weekEnd) {
  const inWeek = events
    .filter((e) => overlapsWeek(e.window, weekStart, weekEnd))
    .map((e) => ({ ...e, hub: classifyEventHub(e) }))
    .sort((a, b) => scoreEvent(b) - scoreEvent(a));

  const byZone = { central: [], military: [], coastal: [] };
  for (const event of inWeek) {
    byZone[event.hub.zone].push(event);
  }

  const picked = [];
  const targets = [
    { zone: 'central', count: 2 },
    { zone: 'military', count: 2 },
    { zone: 'coastal', count: 2 },
  ];

  for (const { zone, count } of targets) {
    picked.push(...byZone[zone].slice(0, count));
  }

  if (picked.length < 5) {
    const pickedKeys = new Set(picked.map((e) => e.title));
    for (const event of inWeek) {
      if (picked.length >= 6) break;
      if (!pickedKeys.has(event.title)) {
        picked.push(event);
        pickedKeys.add(event.title);
      }
    }
  }

  return picked.slice(0, 6);
}

function buildEventsMarkdown(events, weekLabel, heritage) {
  const intro =
    `## Introduction\n\nYour weekly **Regional Edit** for the week of **${weekLabel}** — curated happenings across the 130-mile Eastern NC arc from the Research Triangle through the Sandhills military communities to the Crystal Coast and Cape Fear.\n\n## Featured Events\n\n`;

  let eventsBlock;
  if (!events.length) {
    eventsBlock =
      '_Automated feeds returned limited listings this week. Review and enrich with local chamber, base MWR, and coastal tourism calendars before publishing._\n\n**Suggested coverage zones:**\n- **Central NC:** Raleigh-Durham metro festivals and markets\n- **Military communities:** Fort Liberty (Fayetteville), Seymour Johnson AFB (Goldsboro), Camp Lejeune (Jacksonville)\n- **Coastal towns:** Wilmington, New Bern, Morehead City, Emerald Isle';
  } else {
    eventsBlock = events
      .map((event) => {
        const when = formatEventDate(event.window);
        const summary = stripHtml(event.description).slice(0, 160);
        const link = event.link ? ` [Details](${event.link})` : '';
        return `- **${event.title}** — ${when} · *${event.hub.label}*. ${summary}${summary.length >= 160 ? '…' : ''}${link}`;
      })
      .join('\n');
  }

  const heritageBlock =
    `\n\n## 📜 Eastern NC Heritage & Hidden Gem\n\n**${heritage.region}** — ${heritage.fact}\n\n## Considering a Move?\n\nFrom PCS relocations to coastal second homes, Core Collective advisors guide buyers across the Triangle, Sandhills, and coast. Connect for a personalized community tour.`;

  return intro + eventsBlock + heritageBlock;
}

function buildEventsExcerpt(events) {
  if (!events.length) {
    return 'Weekly draft: 5–6 curated events across Central NC, military base communities, and coastal towns — plus an Eastern NC heritage spotlight.';
  }
  const zones = [...new Set(events.map((e) => e.hub.zone))];
  const zoneLabel = zones.map((z) => ({ central: 'Triangle', military: 'Sandhills', coastal: 'Coast' }[z] || z)).join(', ');
  return `${events.length} regional events this week spanning ${zoneLabel} — from Raleigh-Durham to Fayetteville, Goldsboro, Jacksonville, and the Crystal Coast.`;
}

function buildMarketMarkdown(weekLabel, spotlight) {
  return `## Market Overview

Eastern North Carolina regional briefing for the week of **${weekLabel}** — covering luxury housing dynamics, PCS relocation flows, coastal investment demand, and commute-corridor growth across the 130-mile Raleigh radius.

## Luxury Housing Trends

- **Raleigh-Durham Metro** — Luxury inventory above $750K remains tight in North Hills, Cary, and Apex; staged listings continue to see competitive offers within the first 10 days.
- **Sandhills & Military Markets** — Fayetteville, Goldsboro, and Jacksonville offer materially lower basis than Wake County with strong rental demand from PCS and contractor households.
- **Coastal Premium** — Wilmington, New Bern, and Carteret County barrier-island markets show sustained second-home and retiree demand with supply constraints on water-adjacent parcels.

## PCS Military Relocation Buyer Flows

Fort Liberty (Fayetteville), Seymour Johnson AFB (Goldsboro), and Camp Lejeune (Jacksonville) drive recurring turnover cycles that create predictable absorption in the $300K–$600K executive segment. Buyers extending tours or converting BAH to equity increasingly look 30–45 minutes off-base for newer construction and school access.

## Coastal Investment Demand

Emerald Isle, Morehead City, and Wilmington capture distinct investor profiles: vacation rental yield on Bogue Banks, maritime-industry rentals in Carteret County, and long-term appreciation along the Cape Fear corridor. Triangle equity migration via I-40 continues to support coastal basis growth.

## Commute Corridor Growth (I-40 · I-95 · US-70 / I-42)

Johnston County (Clayton, Smithfield), Wayne County (Goldsboro), and Wilson–Greenville connectors benefit from US-70 and I-42 narratives that shorten Raleigh access. Remote and hybrid RTP workers increasingly underwrite "regional lifestyle" searches across this arc rather than limiting to Wake County.

## 📍 Submarket History & Defense Corridor Spotlight

**${spotlight.region}** — ${spotlight.body}

*Connect with Core Collective for a personalized regional market briefing spanning the Triangle, Sandhills, and coast.*`;
}

function buildMarketExcerpt() {
  return 'Regional market draft: luxury trends, PCS relocation flows, coastal investment demand, and I-40/I-95/US-70 corridor growth across Eastern NC.';
}

async function fetchEventbriteEvents() {
  const token = process.env.EVENTBRITE_TOKEN;
  if (!token) return [];

  const collected = [];
  for (const hub of REGIONAL_HUBS) {
    const city = hub.label.split('(')[0].trim().split('&')[0].trim();
    const url = new URL('https://www.eventbriteapi.com/v3/events/search/');
    url.searchParams.set('location.address', `${city}, NC`);
    url.searchParams.set('location.within', '35mi');
    url.searchParams.set('expand', 'venue');
    url.searchParams.set('sort_by', 'date');

    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      for (const ev of data.events || []) {
        collected.push({
          title: ev.name?.text || 'Untitled Event',
          link: ev.url || '',
          description: ev.description?.text || ev.summary || '',
          pubDate: ev.start?.utc || '',
          categories: [],
          hubId: hub.id,
          hubLabel: hub.label,
          window: {
            start: ev.start?.utc ? new Date(ev.start.utc) : null,
            end: ev.end?.utc ? new Date(ev.end.utc) : null,
          },
          source: 'Eventbrite',
        });
      }
      console.log(`Eventbrite: ${(data.events || []).length} events near ${city}`);
    } catch (err) {
      console.warn(`Eventbrite (${city}) skipped: ${err.message}`);
    }
  }
  return collected;
}

async function fetchRssEvents() {
  const collected = [];
  for (const feed of RSS_FEEDS) {
    const hub = REGIONAL_HUBS.find((h) => h.id === feed.hub) || REGIONAL_HUBS[0];
    try {
      const xml = await fetchText(feed.url);
      const items = parseRssItems(xml);
      for (const item of items) {
        collected.push({
          ...item,
          hubId: feed.hub,
          hubLabel: hub.label,
          source: feed.name,
          window: parseEventWindow(item.description, item.pubDate),
        });
      }
      console.log(`RSS: ${items.length} items from ${feed.name}`);
    } catch (err) {
      console.warn(`${feed.name} skipped: ${err.message}`);
    }
  }
  return collected;
}

async function maybeEnhanceWithAI(eventsArticle, marketArticle, context) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { eventsArticle, marketArticle };

  try {
    const prompt = `You are a luxury Eastern NC real estate editorial writer for Core Collective. Refine the excerpt and body markdown for two weekly draft blog posts. Keep markdown structure, section headers (including emoji headers), and factual tone. Return JSON: {"eventsBody":"...","eventsExcerpt":"...","marketBody":"...","marketExcerpt":"..."}.

Context: Week of ${context.weekLabel}. Events found: ${context.eventCount}. Heritage region: ${context.heritage.region}.

Events draft body:
${eventsArticle.body}

Market draft body:
${marketArticle.body}`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Return valid JSON only. Preserve markdown section headers exactly.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.5,
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
    const data = await res.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
    return {
      eventsArticle: {
        ...eventsArticle,
        body: parsed.eventsBody || eventsArticle.body,
        excerpt: parsed.eventsExcerpt || eventsArticle.excerpt,
      },
      marketArticle: {
        ...marketArticle,
        body: parsed.marketBody || marketArticle.body,
        excerpt: parsed.marketExcerpt || marketArticle.excerpt,
      },
    };
  } catch (err) {
    console.warn(`AI enhancement skipped: ${err.message}`);
    return { eventsArticle, marketArticle };
  }
}

const AUTO_DRAFT_TITLES = new Set([EVENTS_TITLE, MARKET_TITLE]);

function isWeeklyAutoDraft(post) {
  if (post?.draft !== true || post?.author !== AUTHOR) return false;
  if (AUTO_DRAFT_TITLES.has(post?.title)) return true;
  if (typeof post?.title === 'string' && post.title.startsWith('The Weekend Edit: Triangle Events')) return true;
  return false;
}

function upsertWeeklyDrafts(existingPosts, newDrafts) {
  const preserved = (existingPosts || []).filter((post) => !isWeeklyAutoDraft(post));
  return [...newDrafts, ...preserved];
}

async function main() {
  const { mon, sun } = getWeekRange();
  const weekLabel = formatWeekTitle(mon);
  const weekIndex = getWeekIndex(mon);
  const heritage = pickRotating(HERITAGE_GEMS, weekIndex);
  const spotlight = pickRotating(DEFENSE_SPOTLIGHTS, weekIndex);

  const rssEvents = await fetchRssEvents();
  const ebEvents = await fetchEventbriteEvents();
  const merged = dedupeEvents([...rssEvents, ...ebEvents]);
  const curated = curateRegionalEvents(merged, mon, sun);

  let eventsArticle = {
    title: EVENTS_TITLE,
    date: mon.toISOString(),
    author: AUTHOR,
    category: 'Community Events',
    excerpt: buildEventsExcerpt(curated),
    cover_image: COVERS.events.image,
    cover_alt: COVERS.events.alt,
    body: buildEventsMarkdown(curated, weekLabel, heritage),
    order: 0,
    draft: true,
  };

  let marketArticle = {
    title: MARKET_TITLE,
    date: mon.toISOString(),
    author: AUTHOR,
    category: 'Market Insights',
    excerpt: buildMarketExcerpt(),
    cover_image: COVERS.market.image,
    cover_alt: COVERS.market.alt,
    body: buildMarketMarkdown(weekLabel, spotlight),
    order: 1,
    draft: true,
  };

  ({ eventsArticle, marketArticle } = await maybeEnhanceWithAI(eventsArticle, marketArticle, {
    weekLabel,
    eventCount: curated.length,
    heritage,
  }));

  let blog;
  try {
    blog = JSON.parse(fs.readFileSync(BLOG_PATH, 'utf8'));
  } catch {
    blog = { posts: [] };
  }

  blog.posts = upsertWeeklyDrafts(blog.posts, [eventsArticle, marketArticle]);
  fs.writeFileSync(BLOG_PATH, `${JSON.stringify(blog, null, 2)}\n`, 'utf8');

  console.log(`Draft ready: "${eventsArticle.title}" (${curated.length} events)`);
  console.log(`Draft ready: "${marketArticle.title}"`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
