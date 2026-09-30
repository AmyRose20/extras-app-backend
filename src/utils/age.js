// Helpers for working with date of birth instead of a stored age.

// Works out someone's age today from their date of birth.
// e.g. born 1997-03-14 → 29 (on 30-09-2026)
function ageFromDob(dob) {
  if (!dob) return null;
  const birth = new Date(dob);
  const today = new Date();

  let age = today.getFullYear() - birth.getUTCFullYear();
  const hadBirthdayThisYear =
    today.getMonth() > birth.getUTCMonth() ||
    (today.getMonth() === birth.getUTCMonth() && today.getDate() >= birth.getUTCDate());
  if (!hadBirthdayThisYear) age -= 1;

  return age;
}

// Turns an age range (e.g. 25–45) into a date-of-birth range the database can filter on.
//   aged at least 25  → born on or before today's date 25 years ago
//   aged at most 45   → born after today's date 46 years ago
// Returns a Prisma filter like { lte: Date, gt: Date }, or undefined if no range was given.
function dobFilterForAgeRange(minAge, maxAge) {
  const today = new Date();
  const yearsAgo = (years) =>
    new Date(Date.UTC(today.getFullYear() - years, today.getMonth(), today.getDate()));

  const filter = {};
  if (minAge != null) filter.lte = yearsAgo(minAge);
  if (maxAge != null) filter.gt = yearsAgo(maxAge + 1);

  return Object.keys(filter).length > 0 ? filter : undefined;
}

module.exports = { ageFromDob, dobFilterForAgeRange };