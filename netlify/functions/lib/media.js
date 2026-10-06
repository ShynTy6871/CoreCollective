/**
 * Shared photo helpers for the Doorify / SourceRE listing functions
 * (idx-listings.js and get-listings.js), so the photo rules live in one place.
 *
 * This file lives in a sub-folder (lib/) so Netlify does not deploy it as a
 * function of its own; it is simply bundled into the functions that require it.
 */

// Doorify's Media array isn't only photos — it also carries floor plans,
// virtual tour links, and documents, some of which can sort ahead of the
// real photos by Order. Anything whose MediaCategory clearly isn't a
// photo gets excluded here so the hero image and gallery can never end
// up pointing at a floor plan PDF or a broken non-image URL. Media entries
// with no MediaCategory at all are kept (some feeds omit it).
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

// Original photos live on cdn.sourceredb.com; the resize CDN serves the
// small / medium / large size classes.
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

// Every real photo of a listing, in display order (PreferredPhotoYN first if
// the feed provides it, then by Order), as sized URLs. The first entry is the
// listing's primary photo.
function listPhotos(media, size) {
  const list = Array.isArray(media) ? media : [];
  return list
    .filter((m) => {
      if (!m || !m.MediaURL) return false;
      const category = String(m.MediaCategory || '').trim().toLowerCase();
      return !NON_PHOTO_MEDIA_CATEGORIES.includes(category);
    })
    .sort((a, b) => {
      const pa = a.PreferredPhotoYN ? 0 : 1;
      const pb = b.PreferredPhotoYN ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return (Number(a.Order) || 0) - (Number(b.Order) || 0);
    })
    .map((m) => resizePhoto(m.MediaURL, size));
}

module.exports = { NON_PHOTO_MEDIA_CATEGORIES, resizePhoto, listPhotos };
