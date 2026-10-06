/**
 * Shared "is this a rental / lease listing?" rules for the listing functions
 * (get-listings.js and idx-listings.js). The site is for buyers, so rentals
 * (e.g. PropertyType "Residential Lease") are kept out of the homepage
 * featured listings and Property Search.
 *
 * Lives in lib/ so Netlify doesn't deploy it as a function of its own.
 */

// Matches "Residential Lease", "Commercial Lease", "Rental", "For Rent"...
// but not words that merely contain "lease" (e.g. "Leasehold").
const RENTAL_PATTERN = /\b(lease|rental|rent)\b/i;

// Final check on a returned record (PropertyType OR PropertySubType).
function isRental(rec) {
  if (!rec) return false;
  return RENTAL_PATTERN.test(String(rec.PropertyType || '')) ||
    RENTAL_PATTERN.test(String(rec.PropertySubType || ''));
}

// OData clauses that stop the known lease types at the source, so excluding
// them doesn't shrink the "newest 100" window. Equality only (null-safe);
// isRental() above still catches anything these miss.
const NOT_RENTAL_FILTERS = [
  "PropertyType ne 'Residential Lease'",
  "PropertyType ne 'Commercial Lease'"
];

module.exports = { isRental, NOT_RENTAL_FILTERS, RENTAL_PATTERN };
