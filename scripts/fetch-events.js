#!/usr/bin/env node
'use strict';

/**
 * Monthly Eastern NC community + market draft generator.
 * Produces one combined blog draft for the six towns Core Collective serves.
 * Towns are too small for reliable public event feeds — editors fill a checklist.
 */

const fs = require('fs');
const path = require('path');

const BLOG_PATH = path.join(__dirname, '..', 'content', 'blog.json');
const AUTHOR = 'Core Collective Editorial';
const POST_TITLE = 'Eastern NC Monthly: Community Events & Market Notes';

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

const COMMUNITY_SPOTLIGHTS = [
  {
    id: 'wendell',
    fact: 'Named after poet Oliver Wendell Holmes, Wendell was ranked North Carolina\'s fastest-growing town for 2020–2021, with population up 114% since 2020 — the fastest growth in the state — and some of the newest housing stock in North Carolina.',
  },
  {
    id: 'zebulon',
    fact: 'Zebulon sits at the Highways 64 and 264 crossroads in eastern Wake County and is home to North America\'s only bagpipe maker. Population is up 82% since 2020 — second-fastest in NC.',
  },
  {
    id: 'garner',
    fact: 'Garner is a Wake County value leader just south of Raleigh, home to Amazon\'s 2.6-million-square-foot fulfillment center and American Idol Season 10 winner Scotty McCreery. Population is up 38% since 2020.',
  },
  {
    id: 'fouroaks',
    fact: 'Four Oaks, established in 1889, is named for oak sprouts growing from an old stump. Its Historic Commercial District is listed on the National Register of Historic Places, and population is up 36% since 2020.',
  },
  {
    id: 'rockymount',
    fact: 'Rocky Mount may exist because of a 200-year-old post office spelling error. Today it is an established Nash/Edgecombe hub along I-95, with the historic Rocky Mount Mills district anchoring shops, dining, and events.',
  },
  {
    id: 'goldsboro',
    fact: 'Goldsboro is home to one of the few surviving 19th-century synagogues in the U.S. and is anchored by Seymour Johnson Air Force Base\'s 4th Fighter Wing. Cost of living is roughly 22% below the national average.',
  },
];

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
  return pool[index % pool.length];
}

function townName(id) {
  return (TOWNS.find((t) => t.id === id) || TOWNS[0]).name;
}

function buildMarkdown(monthLabel, spotlight) {
  const checklist = TOWNS.map((t) => `- [ ] **${t.name}:** _(event name, date, link)_`).join('\n');
  const market = TOWNS.map((t) => `- **${t.name}** — Median home price around ${t.medianPrice}.`).join('\n');

  return `## Introduction

Your monthly **Eastern NC** briefing for **${monthLabel}** — covering Wendell, Zebulon, Garner, Four Oaks, Rocky Mount, and Goldsboro.

## What's Happening This Month

_Add this month's events below before publishing — one per town when possible:_

${checklist}

## Town-by-Town Market Snapshot

${market}

## 📍 Community Spotlight

**${townName(spotlight.id)}** — ${spotlight.fact}

## Considering a Move?

Core Collective advisors help buyers, sellers, and investors across Wendell, Zebulon, Garner, Four Oaks, Rocky Mount, and Goldsboro. Connect for a personalized community tour.`;
}

function buildExcerpt(monthLabel, spotlight) {
  return `${monthLabel} draft for Wendell, Zebulon, Garner, Four Oaks, Rocky Mount, and Goldsboro — events checklist, town median prices, and a ${townName(spotlight.id)} community spotlight.`;
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
  const spotlight = pickRotating(COMMUNITY_SPOTLIGHTS, getMonthIndex(monthStart));

  const article = {
    title: POST_TITLE,
    date: monthStart.toISOString(),
    author: AUTHOR,
    category: 'Community Events',
    excerpt: buildExcerpt(monthLabel, spotlight),
    cover_image: COVER.image,
    cover_alt: COVER.alt,
    body: buildMarkdown(monthLabel, spotlight),
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

  console.log(`Draft ready: "${article.title}" (${monthLabel}; spotlight: ${townName(spotlight.id)})`);
}

main();
