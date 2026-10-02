// Fills the database with realistic test data for the Extras App.
// Run with: npx prisma db seed
// WARNING: deletes ALL existing data (and all profile photos in Firebase Storage) first.
require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const { randomUUID } = require('crypto');
const { getStorage } = require('firebase-admin/storage');

const firebaseApp = require('../src/config/firebase');
const { encrypt } = require('../src/utils/crypto');
const { normaliseIban, isValidIban, normaliseBic, isValidBic } = require('../src/utils/bankDetails');
const { makeFacePhoto, makeFullBodyPhoto } = require('./seedPhotos');
const extrasData = require('./seedExtras');

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;
const DAY = 24 * 60 * 60 * 1000;

// ---------- Small helpers ----------

// A date `offsetDays` from today at a set time, e.g. dayAt(3, 7) = 3 days from now at 07:00
function dayAt(offsetDays, hour, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function ageFromDob(dob) {
  const today = new Date();
  const birth = new Date(dob);
  let age = today.getFullYear() - birth.getFullYear();
  const hadBirthday =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  if (!hadBirthday) age -= 1;
  return age;
}

// Does this extra fit a call request's criteria? (same rules as the app's matching)
function matches(extra, criteria) {
  const age = ageFromDob(extra.dateOfBirth);
  if (criteria.minAge && age < criteria.minAge) return false;
  if (criteria.maxAge && age > criteria.maxAge) return false;
  if (criteria.gender && extra.gender !== criteria.gender) return false;
  if (criteria.skills && !criteria.skills.every((skill) => extra.skills.includes(skill))) return false;
  return true;
}

// ---------- Firebase Storage ----------

const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
if (!bucketName) {
  throw new Error('FIREBASE_STORAGE_BUCKET must be set in .env');
}
const bucket = getStorage(firebaseApp).bucket(bucketName);

// Uploads a photo to the same place the app does, and returns its download URL
async function uploadPhoto(userId, photoType, jpegBytes) {
  const filePath = `profile-photos/${userId}/${photoType}.jpg`;
  const token = randomUUID(); // makes the URL work like one from the app's getDownloadURL
  await bucket.file(filePath).save(jpegBytes, {
    contentType: 'image/jpeg',
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  });
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media&token=${token}`;
}

async function main() {
  // ----- Clean out old data (order matters because of relations) -----
  console.log('Clearing old data...');
  await prisma.callInvite.deleteMany();
  await prisma.callRequest.deleteMany();
  await prisma.shootDay.deleteMany();
  await prisma.user.deleteMany(); // also deletes extra profiles (onDelete: Cascade)
  await prisma.location.deleteMany();
  await prisma.production.deleteMany();
  await bucket.deleteFiles({ prefix: 'profile-photos/' }); // old photos belong to deleted users

  const password = await bcrypt.hash('password123', SALT_ROUNDS);

  // ----- Productions -----
  const wednesday = await prisma.production.create({ data: { name: 'Wednesday season 3' } });
  const bloodaxe = await prisma.production.create({ data: { name: 'Bloodaxe season 2' } });
  const productionsByKey = { wednesday, bloodaxe };

  // ----- Saved meeting points (one studio per production; pins are approximate) -----
  const ashfordPhase1 = await prisma.location.create({
    data: {
      name: 'Ashford Studios - Phase 1',
      address: 'Ballyhenry, Ashford, Co. Wicklow',
      latitude: 53.0164,
      longitude: -6.1027,
      productionId: wednesday.id,
    },
  });
  const ashfordPhase2 = await prisma.location.create({
    data: {
      name: 'Ashford Studios - Phase 2',
      address: 'Trinity, Co. Wicklow',
      latitude: 53.0085,
      longitude: -6.1132,
      productionId: bloodaxe.id,
    },
  });

  // ----- Coordinators (one per production) -----
  const wednesdayAdmin = await prisma.user.create({
    data: {
      email: 'wednesday@example.com',
      passwordHash: password,
      name: 'Wednesday Coordinator',
      role: 'ADMIN',
      phone: '087 555 0100',
      productionId: wednesday.id,
    },
  });
  const bloodaxeAdmin = await prisma.user.create({
    data: {
      email: 'bloodaxe@example.com',
      passwordHash: password,
      name: 'Bloodaxe Coordinator',
      role: 'ADMIN',
      phone: '087 555 0200',
      productionId: bloodaxe.id,
    },
  });

  // ----- Extras (with photos and encrypted bank details) -----
  console.log(`Creating ${extrasData.length} extras and uploading their photos...`);
  const extras = []; // { data, profileId } for each extra
  for (const [index, data] of extrasData.entries()) {
    const phone = `087 555 01${String(index + 1).padStart(2, '0')}`;

    // Bank details: tidied, checked and encrypted, the same way the app saves them
    let bankFields = {};
    if (data.bank) {
      const iban = normaliseIban(data.bank.iban);
      const bic = normaliseBic(data.bank.bic);
      if (!isValidIban(iban) || !isValidBic(bic)) {
        throw new Error(`Seed bank details for ${data.name} are not valid`);
      }
      bankFields = { ibanEncrypted: encrypt(iban), bicEncrypted: encrypt(bic) };
    }

    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash: password,
        name: data.name,
        role: 'EXTRA',
        phone,
        extraProfile: {
          create: {
            dateOfBirth: new Date(data.dateOfBirth),
            gender: data.gender,
            heightCm: data.heightCm,
            skills: data.skills,
            languages: data.languages,
            availability: data.availability,
            phoneNumber: phone,
            contactEmail: data.email,
            hasSmartphone: data.hasSmartphone,
            ...bankFields,
            memberships: {
                 create: data.productions.map((key) => ({
                   production: { connect: { id: productionsByKey[key].id } },
                   status: 'APPROVED', // seeded extras start approved on their productions
                 })),
               },
          },
        },
      },
      include: { extraProfile: true },
    });

    // Cartoon photos, uploaded to profile-photos/<userId>/ like a real upload
    const person = { name: data.name, gender: data.gender, age: ageFromDob(data.dateOfBirth) };
    const facePhotoUrl = await uploadPhoto(user.id, 'face', await makeFacePhoto(person));
    const fullBodyPhotoUrl = await uploadPhoto(user.id, 'fullbody', await makeFullBodyPhoto(person));
    await prisma.extraProfile.update({
      where: { id: user.extraProfile.id },
      data: { facePhotoUrl, fullBodyPhotoUrl },
    });

    extras.push({ data, profileId: user.extraProfile.id });
    console.log(`  ${index + 1}/${extrasData.length} ${data.name}`);
  }

  // ----- Shoot days -----
  // Past days show history (worked / declined / expired); upcoming days show live invites.
  const shootDay = (production, admin, offsetDays, place, wrapHour = null) =>
    prisma.shootDay.create({
      data: {
        productionId: production.id,
        createdById: admin.id,
        date: dayAt(offsetDays, 7),
        estimatedWrapAt: wrapHour ? dayAt(offsetDays, wrapHour) : null,
        location: place.name,
        locationAddress: place.address,
        latitude: place.latitude,
        longitude: place.longitude,
      },
    });

  // "Other" meeting points, dropped as pins (not saved locations)
  const glendalough = {
    name: 'Glendalough - Upper Lake car park',
    address: 'Glendalough, Co. Wicklow',
    latitude: 53.0064,
    longitude: -6.3524,
  };
  const brittasBay = {
    name: 'Brittas Bay beach car park',
    address: 'Brittas Bay, Co. Wicklow',
    latitude: 52.8745,
    longitude: -6.0548,
  };

  const wedPast1 = await shootDay(wednesday, wednesdayAdmin, -60, ashfordPhase1);
  const wedPast2 = await shootDay(wednesday, wednesdayAdmin, -20, ashfordPhase1, 19);
  const wedSoon = await shootDay(wednesday, wednesdayAdmin, 3, ashfordPhase1, 18);
  const wedLake = await shootDay(wednesday, wednesdayAdmin, 7, glendalough, 17);
  await shootDay(wednesday, wednesdayAdmin, 14, ashfordPhase1); // no call requests yet

  const bxPast1 = await shootDay(bloodaxe, bloodaxeAdmin, -45, ashfordPhase2, 19);
  const bxPast2 = await shootDay(bloodaxe, bloodaxeAdmin, -15, brittasBay);
  const bxSoon = await shootDay(bloodaxe, bloodaxeAdmin, 5, ashfordPhase2, 20);
  const bxBeach = await shootDay(bloodaxe, bloodaxeAdmin, 10, brittasBay, 16);
  await shootDay(bloodaxe, bloodaxeAdmin, 21, ashfordPhase2); // no call requests yet

  // ----- Call requests + invites -----
  // Invites go to every extra on that production who matches the criteria.
  // Statuses are set so every state appears somewhere:
  //   past day:     first `quantity` ACCEPTED (= worked), then DECLINED / PENDING (= expired)
  //   upcoming day: first 2 ACCEPTED, then one DECLINED, the rest PENDING
  // Darragh Nolan cancels three Bloodaxe invites -> 3 strikes flag.
  const STRIKES_EMAIL = 'extra11@example.com';
  let inviteCount = 0;

  async function callRequest(day, production, description, quantityNeeded, criteria) {
    const request = await prisma.callRequest.create({
      data: { shootDayId: day.id, description, quantityNeeded, criteria },
    });

    const isPast = day.date < new Date();
    const invited = extras.filter(
      (extra) => extra.data.productions.includes(production) && matches(extra.data, criteria),
    );

    // Sent a week before the shoot day (or yesterday, if that's still in the future)
    const sentAt = new Date(Math.min(day.date.getTime() - 7 * DAY, Date.now() - DAY));
    const respondedAt = new Date(Math.min(sentAt.getTime() + DAY, Date.now()));

    let accepted = 0;
    let other = 0;
    for (const extra of invited) {
      let status;
      if (extra.data.email === STRIKES_EMAIL && production === 'bloodaxe') {
        status = 'CANCELLED'; // accepted, then backed out
      } else if (isPast) {
        if (accepted < quantityNeeded) status = 'ACCEPTED';
        else status = other++ % 2 === 0 ? 'DECLINED' : 'PENDING';
      } else if (accepted < 2) {
        status = 'ACCEPTED';
      } else {
        status = other++ === 0 ? 'DECLINED' : 'PENDING';
      }
      if (status === 'ACCEPTED') accepted++;

      await prisma.callInvite.create({
        data: {
          callRequestId: request.id,
          extraProfileId: extra.profileId,
          status,
          sentAt,
          respondedAt: status === 'PENDING' ? null : respondedAt,
        },
      });
      inviteCount++;
    }
  }

  // Wednesday
  await callRequest(wedPast1, 'wednesday', 'Background - school corridor', 6, {});
  await callRequest(wedPast2, 'wednesday', 'Courtroom gallery', 3, { minAge: 40 });
  await callRequest(wedSoon, 'wednesday', 'Stunt scene - fight in the quad', 2, { minAge: 25, maxAge: 45, skills: ['Stunt work'] });
  await callRequest(wedSoon, 'wednesday', 'Dancers - school dance', 3, { gender: 'FEMALE', skills: ['Dancing'] });
  await callRequest(wedLake, 'wednesday', 'Hikers in the background', 4, {});

  // Bloodaxe
  await callRequest(bxPast1, 'bloodaxe', 'Viking village - market day', 8, {});
  await callRequest(bxPast2, 'bloodaxe', 'Viking raiders - beach fight', 3, { gender: 'MALE', skills: ['Stunt work'] });
  await callRequest(bxSoon, 'bloodaxe', 'Archers on the ramparts', 3, { skills: ['Archery'] });
  await callRequest(bxSoon, 'bloodaxe', 'Villagers fleeing the raid', 6, {});
  await callRequest(bxBeach, 'bloodaxe', 'Longship landing', 5, { gender: 'MALE', minAge: 20, maxAge: 50 });


  // ----- Production join requests (Phase 3 Part 7) -----
  // Two Wednesday-only extras asking to join Bloodaxe (PENDING),
  // and one Bloodaxe-only extra denied by Wednesday 10 days ago (can ask again in 20 days).
  const profileIdFor = (email) => {
       const extra = extras.find((e) => e.data.email === email);
       if (!extra) throw new Error(`Seed: no extra with email ${email}`);
       return extra.profileId;
     };
     await prisma.extraProduction.create({
       data: { extraProfileId: profileIdFor('extra1@example.com'), productionId: bloodaxe.id },
     });
     await prisma.extraProduction.create({
       data: { extraProfileId: profileIdFor('extra2@example.com'), productionId: bloodaxe.id },
     });
     await prisma.extraProduction.create({
       data: {
         extraProfileId: profileIdFor('extra3@example.com'),
         productionId: wednesday.id,
         status: 'DENIED',
         requestedAt: dayAt(-12, 10),
         reviewedAt: dayAt(-10, 12),
         reviewedByAdminId: wednesdayAdmin.id,
       },
     });
  console.log('Created 2 pending production requests (Bloodaxe) and 1 denied (Wednesday).');

  console.log(`Created ${inviteCount} invites.`);
  console.log('');
  console.log('Seed complete! All passwords: password123');
  console.log('Coordinators:');
  console.log('  wednesday@example.com -> Wednesday season 3');
  console.log('  bloodaxe@example.com  -> Bloodaxe season 2');
  console.log('Extras: extra1@example.com ... extra25@example.com');
  console.log('  extra11 (Darragh Nolan) has 3 strikes on Bloodaxe');
  console.log('  No smartphone: extra8, extra16, extra20, extra21, extra25');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });