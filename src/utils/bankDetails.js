// Checking, tidying and masking bank details.

// "ie29 aibk 9311 5212 3456 78" → "IE29AIBK93115212345678"
function normaliseIban(iban) {
  return String(iban).replace(/\s+/g, '').toUpperCase();
}

// Checks an IBAN's shape and its built-in check digits (the "mod 97" rule
// every real IBAN follows), so most typos are caught immediately.
function isValidIban(iban) {
  const value = normaliseIban(iban);

  // 2 letters (country) + 2 digits (check digits) + 11–30 letters/numbers
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(value)) return false;

  // Move the first 4 characters to the end, and turn letters into numbers (A=10, B=11 ... Z=35)
  const rearranged = value.slice(4) + value.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));

  // The whole number divided by 97 must leave a remainder of 1.
  // It's too long for normal maths, so we work through it one digit at a time.
  let remainder = 0;
  for (const digit of numeric) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

// "aibk ie2d" → "AIBKIE2D"
function normaliseBic(bic) {
  return String(bic).replace(/\s+/g, '').toUpperCase();
}

// A BIC is 8 or 11 characters: bank (4 letters) + country (2 letters) + location (2) + optional branch (3)
function isValidBic(bic) {
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(normaliseBic(bic));
}

// "IE29AIBK93115212345678" → "IE•• •••• •••• 5678" (safe to show on the extra's phone)
function maskIban(iban) {
  const value = normaliseIban(iban);
  return `${value.slice(0, 2)}•• •••• •••• ${value.slice(-4)}`;
}

module.exports = { normaliseIban, isValidIban, normaliseBic, isValidBic, maskIban };