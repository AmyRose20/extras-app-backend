// The same choices as the mobile app's src/constants.ts, for the web sign-up form (Phase 3 Part 11).
// Keep the two in sync: call request matching uses these exact names.

const SKILL_GROUPS = [
  { title: 'Stunts & action', options: ['Stunt work', 'Martial arts', 'Boxing', 'Firearms (licensed)', 'Archery'] },
  { title: 'Performance', options: ['Acting / improv', 'Dancing', 'Singing', 'Musical instrument', 'Sign language'] },
  { title: 'Driving & equipment', options: ['Driving (manual)', 'Motorbike', 'Horse riding'] },
  { title: 'Sport & fitness', options: ['Swimming', 'Cycling', 'Rowing', 'Gymnastics / yoga'] },
];

const LANGUAGE_GROUPS = [
  { title: 'English & Irish', options: ['English', 'Irish'] },
  { title: 'Romance (Latin)', options: ['French', 'Spanish', 'Portuguese'] },
  { title: 'Germanic', options: ['German', 'Dutch'] },
  { title: 'Nordic', options: ['Swedish', 'Norwegian', 'Danish', 'Finnish', 'Icelandic'] },
];

const AVAILABILITY_GROUPS = [
  { title: 'Any day', options: ['Everyday'] },
  { title: 'Specific weekdays', options: ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays'] },
];

// The app only offers these two (the database allows more)
const GENDER_OPTIONS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
];

const ALL_SKILLS = SKILL_GROUPS.flatMap((group) => group.options);
const ALL_LANGUAGES = LANGUAGE_GROUPS.flatMap((group) => group.options);
const ALL_AVAILABILITY = AVAILABILITY_GROUPS.flatMap((group) => group.options);

module.exports = {
  SKILL_GROUPS, LANGUAGE_GROUPS, AVAILABILITY_GROUPS, GENDER_OPTIONS,
  ALL_SKILLS, ALL_LANGUAGES, ALL_AVAILABILITY,
};