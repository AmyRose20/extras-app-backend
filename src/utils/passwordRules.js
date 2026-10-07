// Password rules (Phase 3 Part 10), following current advice (NIST): length matters most,
// and common or personal passwords are blocked — rather than lots of "must include a symbol" rules.
//   - at least 10 characters (and at most 64)
//   - at least one letter and one number
//   - not a common password (e.g. "password123", "qwerty12345"), or mostly one repeated character
//   - doesn't contain the person's name or email
// These apply whenever a password is SET (reset, change, sign-up) — never when logging in.

const MIN_LENGTH = 10;
const MAX_LENGTH = 64; // bcrypt only uses the first 72 bytes, so keep well under that

// Words that make up most weak passwords. A password is blocked if, once you take away
// the numbers and symbols, all that's left is one of these (e.g. "Password123!" → "password").
const COMMON_WORDS = [
  'password', 'passw', 'pass', 'qwerty', 'qwertyuiop', 'asdfgh', 'asdfghjkl', 'zxcvbnm',
  'letmein', 'welcome', 'admin', 'administrator', 'login', 'iloveyou', 'monkey', 'dragon',
  'football', 'soccer', 'baseball', 'sunshine', 'princess', 'master', 'shadow', 'superman',
  'batman', 'trustno', 'starwars', 'whatever', 'freedom', 'secret', 'hello', 'charlie',
  'abc', 'abcd', 'abcde', 'abcdef', 'abcdefg', 'abcdefgh', 'test', 'tester', 'changeme',
  'ireland', 'dublin', 'summer', 'winter', 'autumn', 'spring', 'extras', 'extrasapp',
];

// Whole passwords that are common even though they're not just a word + numbers
const COMMON_PASSWORDS = [
  '1234567890', '0987654321', '1122334455', '1qaz2wsx3edc', 'qwerty123456', 'q1w2e3r4t5',
  '1q2w3e4r5t', 'a1b2c3d4e5', 'zaq12wsxcde', 'abcd123456', 'abc1234567',
];

// Returns null if the password is OK, or a friendly error message if not.
//   checkPassword('Sunny-Day-42', { name: 'Jordan Lee', email: 'jordan@example.com' })
function checkPassword(password, { name = '', email = '' } = {}) {
  if (typeof password !== 'string' || password.length === 0) {
    return 'Please enter a password';
  }
  if (password.length < MIN_LENGTH) {
    return `Your password must be at least ${MIN_LENGTH} characters`;
  }
  if (password.length > MAX_LENGTH) {
    return `Your password can be at most ${MAX_LENGTH} characters`;
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Your password must include at least one letter and one number';
  }

  const lower = password.toLowerCase();
  const lettersOnly = lower.replace(/[^a-z]/g, ''); // "Password123!" → "password"
  if (COMMON_PASSWORDS.includes(lower) || COMMON_WORDS.includes(lettersOnly) || new Set(lower).size < 5) {
    return 'That password is too common. Please choose something harder to guess';
  }

  // Their name (each part, e.g. "jordan", "lee" if 3+ letters) or the start of their email
  const personalBits = [
    ...name.toLowerCase().split(/[^a-z]+/),
    email.toLowerCase().split('@')[0],
  ].filter((part) => part && part.length >= 3);
  if (personalBits.some((part) => lower.includes(part))) {
    return "Your password can't contain your name or email";
  }

  return null;
}

module.exports = { checkPassword, MIN_LENGTH, MAX_LENGTH };