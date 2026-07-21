#!/usr/bin/env node
'use strict';

/**
 * Weekly Triangle community events draft generator.
 * Fetches public RSS/API sources, formats a blog post draft, and updates content/blog.json.
 *
 * Optional env: EVENTBRITE_TOKEN — adds Eventbrite listings when set.
 */

const fs = require('fs');
const path = require('path');

const BLOG_PATH = path.join(__dirname, '..', 'content', 'blog.json');
const AUTHOR = 'Core Collective Editorial';
const CATEGORY = 'Community Events';
const COVER_IMAGE =
  'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=800&q=80';
const COVER_ALT = 'Crowd enjoying an outdoor community festival in the Triangle';

const RSS_FEEDS = [
  { name: 'Visit Raleigh', url: 'https://www.visitraleigh.com/event/rss/', region: 'Raleigh' },
  { name: 'Durham Community Calendar', url: 'https://www.durhamnc.gov/RSS.aspx?CID=23', region: 'Durham' },
  { name: 'Durham Parks & Recreation', url: 'https://www.dprplaymore.org/RSS.aspx?CID=14', region: 'Durham' },
];

const TRIANGLE_KEYWORDS = [
  'raleigh',
  'durham',
  'cary',
  'north hills',
  'apex',
  'chapel hill',
  'morrisville',
  'wake forest',
  'midtown',
  'research triangle',
];

const USER_AGENT = 'CoreCollective-EventsBot/1.0 (+https://corecollective.com)';

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
  if (range) {
    return { start: parseUsDate(range[1]), end: parseUsDate(range[2]) };
  }
  const single = text.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
  if (single) {
    const d = parseUsDate(single[1]);
    return d ? { start: d, end: d } : null;
  }
  const parsed = pubDate ? new Date(pubDate) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) {
    return { start: parsed, end: parsed };
  }
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

function inferNeighborhood(event) {
  const hay = `${event.title} ${stripHtml(event.description)} ${event.categories.join(' ')}`.toLowerCase();
  if (hay.includes('north hills') || hay.includes('midtown')) return 'North Hills';
  if (hay.includes('cary')) return 'Cary';
  if (hay.includes('apex')) return 'Apex';
  if (hay.includes('chapel hill')) return 'Chapel Hill';
  if (hay.includes('durham')) return 'Durham';
  if (hay.includes('raleigh')) return 'Raleigh';
  return event.region || 'Triangle';
}

function formatEventDate(window) {
  if (!window?.start) return 'Date TBA';
  const opts = { weekday: 'short', month: 'short', day: 'numeric' };
  const start = window.start.toLocaleDateString('en-US', opts);
  if (!window.end || window.end.toDateString() === window.start.toDateString()) return start;
  const end = window.end.toLocaleDateString('en-US', opts);
  return `${start} – ${end}`;
}

function isTriangleRelevant(event) {
  const hay = `${event.title} ${stripHtml(event.description)} ${event.region}`.toLowerCase();
  return TRIANGLE_KEYWORDS.some((kw) => hay.includes(kw));
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
  if (hay.includes('festival') || hay.includes('concert') || hay.includes('market')) score += 2;
  if (hay.includes('north hills')) score += 3;
  if (event.categories.some((c) => /arts|music|food|family|outdoor/i.test(c))) score += 1;
  return score;
}

function buildMarkdown(events, weekLabel) {
  const intro =
    `## Introduction\n\nWelcome to your curated Triangle weekend guide for the week of **${weekLabel}**. From North Hills gatherings to Durham arts programming, here is what is happening across Raleigh, Durham, Cary, and surrounding communities.\n\n## Featured Events\n\n`;

  if (!events.length) {
    return (
      intro +
      '_No upcoming public events were retrieved automatically this week. Open Decap CMS, add local listings manually, then uncheck **Draft** to publish._\n\n## Considering a Move?\n\nExperiencing these neighborhoods firsthand is the best way to find your perfect fit. A Core Collective advisor can arrange private tours and community introductions tailored to your lifestyle.'
    );
  }

  const bullets = events
    .map((event) => {
      const neighborhood = inferNeighborhood(event);
      const when = formatEventDate(event.window);
      const summary = stripHtml(event.description).slice(0, 180);
      const link = event.link ? ` [Details](${event.link})` : '';
      return `- **${event.title}** — ${when} · ${neighborhood}. ${summary}${summary.length >= 180 ? '…' : ''}${link}`;
    })
    .join('\n');

  return (
    intro +
    bullets +
    '\n\n## Considering a Move?\n\nExperiencing these neighborhoods firsthand is the best way to find your perfect fit. A Core Collective advisor can arrange private tours and community introductions tailored to your lifestyle.'
  );
}

function buildExcerpt(events) {
  if (!events.length) {
    return 'Weekly Triangle community events draft — review and publish after confirming local listings for Raleigh, Durham, Cary, and North Hills.';
  }
  const names = events.slice(0, 3).map((e) => e.title);
  return `Your curated weekend guide: ${names.join(', ')}${events.length > 3 ? ', and more' : ''} across the Research Triangle.`;
}

async function fetchEventbriteEvents() {
  const token = process.env.EVENTBRITE_TOKEN;
  if (!token) return [];

  const queries = [
    { q: 'Raleigh, NC', region: 'Raleigh' },
    { q: 'Durham, NC', region: 'Durham' },
    { q: 'Cary, NC', region: 'Cary' },
  ];

  const collected = [];
  for (const { q, region } of queries) {
    const url = new URL('https://www.eventbriteapi.com/v3/events/search/');
    url.searchParams.set('location.address', q);
    url.searchParams.set('location.within', '15mi');
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
          region,
          window: {
            start: ev.start?.utc ? new Date(ev.start.utc) : null,
            end: ev.end?.utc ? new Date(ev.end.utc) : null,
          },
          source: 'Eventbrite',
        });
      }
    } catch (err) {
      console.warn(`Eventbrite (${q}) skipped: ${err.message}`);
    }
  }
  return collected;
}

async function fetchRssEvents() {
  const collected = [];
  for (const feed of RSS_FEEDS) {
    try {
      const xml = await fetchText(feed.url);
      const items = parseRssItems(xml);
      for (const item of items) {
        collected.push({
          ...item,
          region: feed.region,
          source: feed.name,
          window: parseEventWindow(item.description, item.pubDate),
        });
      }
      console.log(`Fetched ${items.length} items from ${feed.name}`);
    } catch (err) {
      console.warn(`${feed.name} skipped: ${err.message}`);
    }
  }
  return collected;
}

function isWeeklyAutoDraft(post) {
  return (
    post?.draft === true &&
    post?.author === AUTHOR &&
    post?.category === CATEGORY &&
    typeof post?.title === 'string' &&
    post.title.startsWith('The Weekend Edit: Triangle Events — Week of')
  );
}

function upsertWeeklyDraft(existingPosts, draftPost) {
  const preserved = (existingPosts || []).filter((post) => !isWeeklyAutoDraft(post));
  return [draftPost, ...preserved];
}

async function main() {
  const { mon, sun } = getWeekRange();
  const weekLabel = formatWeekTitle(mon);

  const rssEvents = await fetchRssEvents();
  const ebEvents = await fetchEventbriteEvents();
  const merged = dedupeEvents([...rssEvents, ...ebEvents]);

  const filtered = merged
    .filter((event) => isTriangleRelevant(event))
    .filter((event) => overlapsWeek(event.window, mon, sun))
    .sort((a, b) => scoreEvent(b) - scoreEvent(a))
    .slice(0, 10);

  const draftPost = {
    title: `The Weekend Edit: Triangle Events — Week of ${weekLabel}`,
    date: mon.toISOString(),
    author: AUTHOR,
    category: CATEGORY,
    excerpt: buildExcerpt(filtered),
    cover_image: COVER_IMAGE,
    cover_alt: COVER_ALT,
    body: buildMarkdown(filtered, weekLabel),
    order: 0,
    draft: true,
  };

  let blog;
  try {
    blog = JSON.parse(fs.readFileSync(BLOG_PATH, 'utf8'));
  } catch {
    blog = { posts: [] };
  }

  blog.posts = upsertWeeklyDraft(blog.posts, draftPost);
  fs.writeFileSync(BLOG_PATH, `${JSON.stringify(blog, null, 2)}\n`, 'utf8');

  console.log(`Draft ready: "${draftPost.title}" (${filtered.length} events)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
