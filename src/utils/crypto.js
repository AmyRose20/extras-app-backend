// Encrypts and decrypts sensitive values (bank details) using AES-256-GCM,
// with the key from BANK_DETAILS_ENCRYPTION_KEY in .env.
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

function getKey() {
  const hex = process.env.BANK_DETAILS_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('BANK_DETAILS_ENCRYPTION_KEY must be set in .env (64 hex characters)');
  }
  return Buffer.from(hex, 'hex');
}

// Turns "IE29AIBK93115212345678" into something like "a1b2...:c3d4...:e5f6..."
// (iv : authTag : encrypted data, all as hex). Returns null for empty values.
function encrypt(plainText) {
  if (plainText === null || plainText === undefined || plainText === '') return null;

  const iv = crypto.randomBytes(12); // a fresh random starting value for every encryption
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag(); // detects if the stored value is ever tampered with

  return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':');
}

// Reverses encrypt(). Returns null for empty values.
function decrypt(stored) {
  if (!stored) return null;

  const [ivHex, authTagHex, dataHex] = stored.split(':');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);

  return decrypted.toString('utf8');
}

module.exports = { encrypt, decrypt };