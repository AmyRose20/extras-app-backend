const { SKILL_GROUPS, LANGUAGE_GROUPS, AVAILABILITY_GROUPS } = require('../utils/profileOptions');

// GET /profile-options — the choices for skills, languages and availability.
// The app loads them from here, and the web sign-up / update-details pages use the same
// lists, so there's one source for them all (src/utils/profileOptions.js).
function getProfileOptions(req, res) {
  return res.json({
    skillGroups: SKILL_GROUPS,
    languageGroups: LANGUAGE_GROUPS,
    availabilityGroups: AVAILABILITY_GROUPS,
  });
}

module.exports = { getProfileOptions };