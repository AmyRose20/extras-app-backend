const { randomUUID } = require('crypto');
const sharp = require('sharp');
const { getStorage } = require('firebase-admin/storage');
const firebaseApp = require('../config/firebase');

// Profile photos uploaded from the web sign-up page (Phase 3 Part 11).
// Saved to the same place as the app's uploads: profile-photos/<userId>/face.jpg or fullbody.jpg

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5MB, the same limit as the app

// Turns an uploaded picture into a JPEG: turned the right way up, at most 1600px,
// and with hidden extras like the phone's GPS location removed (sharp drops them by default).
// Throws if the file isn't really a picture.
async function toProfileJpeg(fileBytes) {
  return sharp(fileBytes)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

// Uploads a photo and returns a download URL that works like one from the app's getDownloadURL
async function uploadProfilePhoto(userId, photoType, jpegBytes) {
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
  if (!bucketName) throw new Error('FIREBASE_STORAGE_BUCKET must be set in .env');

  const bucket = getStorage(firebaseApp).bucket(bucketName);
  const filePath = `profile-photos/${userId}/${photoType}.jpg`;
  const token = randomUUID();

  await bucket.file(filePath).save(jpegBytes, {
    contentType: 'image/jpeg',
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  });
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media&token=${token}`;
}

module.exports = { MAX_PHOTO_BYTES, toProfileJpeg, uploadProfilePhoto };