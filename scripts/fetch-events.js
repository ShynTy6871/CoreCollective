#!/usr/bin/env node
'use strict';

/**
 * Monthly Eastern NC community + market draft generator.
 * Produces one combined blog draft for the six towns Core Collective serves.
 * Towns are too small for reliable public event feeds — editors fill a checklist.
 */

const fs = require('fs');
const path = require('path');

const CONTENT_DIR = path.join(__dirname, '..', 'content');
const BLOG_PATH = path.join(CONTENT_DIR, 'blog.json');
const AUTHOR = 'Core Collective Editorial';
const POST_TITLE = 'Eastern NC Monthly: Community Events & Market Notes';
const CONTACT_URL = 'https://corecollectivere.com/#contact-strip';

const COVER = {
  image: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80',
  alt: 'Homes and community life in Eastern North Carolina',
};

const TOWNS = [
  { id: 'wendell', name: 'Wendell', medianPrice: '$379K' },
  { id: 'zebulon', name: 'Zebulon', medianPrice: '$320K' },
  { id: 'garner', name: 'Garner', medianPrice: '$397K' },
  { id: 'fouroaks', name: 'Four Oaks', medianPrice: '$253K' },
  { id: 'rockymount', name: 'Rocky Mount', medianPrice: '$205K' },
  { id: 'goldsboro', name: 'Goldsboro', medianPrice: '$228K' },
];

const TOWN_SPOTLIGHTS = {
  wendell: "Wendell is one of the fastest-growing towns in North Carolina, up 114% in population since 2020 — the fastest growth rate in the entire state.",
  zebulon: "Zebulon is home to MacLellan Bagpipes, the only business in North America that makes, sells, and teaches how to play the bagpipes.",
  garner: "Garner is the hometown of American Idol Season 10 winner Scotty McCreery, who wrote a song about growing up there called 'Water Tower Town.'",
  fouroaks: "Four Oaks gets its name from four oak tree sprouts that grew from an old stump — the town's motto today is fittingly 'Come Grow with Us.'",
  rockymount: "Rocky Mount may owe its name to a 200-year-old spelling error — the original landmark was called 'Rocky Mound' before a post office transcription mistake made the new name permanent.",
  goldsboro: "Goldsboro is home to one of the few surviving 19th-century synagogue buildings in the entire United States, alongside Seymour Johnson Air Force Base.",
};

const LEGACY_AUTO_DRAFT_TITLES = new Set([
  POST_TITLE,
  'The Regional Edit: Events Across the Triangle, Sandhills & Coast',
  'Eastern NC & Triangle Regional Market Briefing',
]);

function getMonthStart(baseDate = new Date()) {
  return new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
}

function formatMonthLabel(monthStart) {
  return monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function getMonthIndex(monthStart) {
  return monthStart.getFullYear() * 12 + monthStart.getMonth();
}

function pickRotating(pool, index) {
  if (!pool.length) return null;
  return pool[index % pool.length];
}

function readJson(filename, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, filename), 'utf8'));
  } catch {
    return fallback;
  }
}

function firstSentence(text) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const match = cleaned.match(/^.+?[.!?]+(?=\s|$)/);
  return (match ? match[0] : cleaned).trim();
}

function firstPhoto(photos) {
  const list = Array.isArray(photos) ? photos : [];
  for (const item of list) {
    if (!item) continue;
    if (typeof item === 'string' && item.trim()) return item.trim();
    const url = item.image || item.url || item.photo || '';
    if (url) return String(url);
  }
  return '';
}

function formatListingPrice(price) {
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) return String(price || '').trim();
  return '$' + n.toLocaleString('en-US');
}

function loadAgents() {
  const data = readJson('agents.json', { agents: [] });
  return (data.agents || []).filter((a) => a && a.name);
}

function loadApproved(filename, key) {
  const data = readJson(filename, { [key]: [] });
  return (data[key] || []).filter((entry) => entry && !entry.pending_approval);
}

function pickFeaturedListing(properties) {
  const listing = properties[0];
  if (!listing) return null;
  const address = [listing.address, listing.city_state].filter(Boolean).join(', ');
  if (!address && listing.price == null) return null;
  return {
    address: address || 'Featured listing',
    price: formatListingPrice(listing.price),
    photo: firstPhoto(listing.photos),
  };
}

function pickTestimonial(testimonials) {
  const t = testimonials[0];
  if (!t || !t.quote) return null;
  return t;
}

function buildAgentBlurb(agent) {
  if (!agent) return '';
  const title = agent.title || 'Realtor';
  const sentence = firstSentence(agent.bio);
  const intro = `**${agent.name}**, ${title}.`;
  const body = sentence ? ` ${sentence}` : '';
  return `${intro}${body} Ready to talk? Reach out to [${agent.name}](${CONTACT_URL}) today.`;
}

function buildEventsChecklist() {
  return TOWNS.map((t) => `- [ ] **${t.name}:** _(event name, date, link)_`).join('\n');
}

function buildMarkdown({ town, agent, listing, testimonial }) {
  const market = TOWNS.map((t) => `- **${t.name}** — Median home price around ${t.medianPrice}.`).join('\n');
  const fact = TOWN_SPOTLIGHTS[town.id];
  const sections = [
    `## Market Snapshot\n\n${market}`,
    `## Community Spotlight\n\n**${town.name}** — ${fact}\n\n${buildAgentBlurb(agent)}`.trim(),
    `## This Month's Events\n\n_Add this month's events below before publishing — one per town when possible:_\n\n${buildEventsChecklist()}`,
  ];

  if (listing) {
    const photoLine = listing.photo ? `\n\n![${listing.address}](${listing.photo})` : '';
    const pricePart = listing.price ? ` — ${listing.price}` : '';
    sections.push(`## Featured Listing\n\n**${listing.address}**${pricePart}${photoLine}`);
  }

  if (testimonial) {
    const attribution = [testimonial.client_name, testimonial.location].filter(Boolean).join(', ');
    const byline = attribution ? ` — ${attribution}` : '';
    sections.push(`## What Our Clients Are Saying\n\n"${testimonial.quote}"${byline}`);
  }

  return sections.join('\n\n') + '\n';
}

function buildExcerpt(monthLabel, town) {
  return `${monthLabel} draft for Wendell, Zebulon, Garner, Four Oaks, Rocky Mount, and Goldsboro — market snapshot, ${town.name} community spotlight, and this month's events checklist.`;
}

function isMonthlyAutoDraft(post) {
  if (post?.draft !== true || post?.author !== AUTHOR) return false;
  if (LEGACY_AUTO_DRAFT_TITLES.has(post?.title)) return true;
  if (typeof post?.title === 'string' && post.title.startsWith('The Weekend Edit: Triangle Events')) return true;
  return false;
}

function upsertMonthlyDraft(existingPosts, newDraft) {
  const existing = existingPosts || [];
  const existingDraft = existing.find(
    (post) => isMonthlyAutoDraft(post) && post.title === newDraft.title
  );
  const draftToWrite = existingDraft?.body?.includes('- [ ] **') ? existingDraft : newDraft;
  const preserved = existing.filter((post) => !isMonthlyAutoDraft(post));
  return [draftToWrite, ...preserved];
}

function main() {
  const monthStart = getMonthStart();
  const monthLabel = formatMonthLabel(monthStart);
  const monthIndex = getMonthIndex(monthStart);

  const town = pickRotating(TOWNS, monthIndex);
  const agent = pickRotating(loadAgents(), monthIndex);
  const listing = pickFeaturedListing(loadApproved('properties.json', 'properties'));
  const testimonial = pickTestimonial(loadApproved('testimonials.json', 'testimonials'));

  const article = {
    title: POST_TITLE,
    date: monthStart.toISOString(),
    author: AUTHOR,
    category: 'Community Events',
    excerpt: buildExcerpt(monthLabel, town),
    cover_image: COVER.image,
    cover_alt: COVER.alt,
    body: buildMarkdown({ town, agent, listing, testimonial }),
    order: 0,
    draft: true,
  };

  let blog;
  try {
    blog = JSON.parse(fs.readFileSync(BLOG_PATH, 'utf8'));
  } catch {
    blog = { posts: [] };
  }

  blog.posts = upsertMonthlyDraft(blog.posts, article);
  fs.writeFileSync(BLOG_PATH, `${JSON.stringify(blog, null, 2)}\n`, 'utf8');

  console.log(`Draft ready: "${article.title}" (${monthLabel}; spotlight: ${town.name}${agent ? `; agent: ${agent.name}` : ''})`);
}

main();
