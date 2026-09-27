const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;
const DAY = 24 * 60 * 60 * 1000;

async function main() {
  // ----- Clean out old data (order matters because of relations) -----
  await prisma.callInvite.deleteMany();
  await prisma.callRequest.deleteMany();
  await prisma.shootDay.deleteMany();
  await prisma.user.deleteMany(); // also deletes extra profiles (onDelete: Cascade)
  await prisma.production.deleteMany();

  const password = await bcrypt.hash('password123', SALT_ROUNDS);

  // ----- Productions -----
  const wednesday = await prisma.production.create({
    data: { name: 'Wednesday season 3' },
  });
  const bloodaxe = await prisma.production.create({
    data: { name: 'Bloodaxe season 2' },
  });

  // ----- Coordinators (one per production) -----
  const wednesdayAdmin = await prisma.user.create({
    data: {
      email: 'wednesday@example.com',
      passwordHash: password,
      name: 'Wednesday Coordinator',
      role: 'ADMIN',
      phone: '555-0100',
      productionId: wednesday.id,
    },
  });

  const bloodaxeAdmin = await prisma.user.create({
    data: {
      email: 'bloodaxe@example.com',
      passwordHash: password,
      name: 'Bloodaxe Coordinator',
      role: 'ADMIN',
      phone: '555-0200',
      productionId: bloodaxe.id,
    },
  });

  // ----- Extras -----
  // productions: which production(s) each extra is linked to
  const extrasData = [
    { email: 'extra1@example.com', name: 'Jordan Lee',   age: 29, gender: 'FEMALE', heightCm: 171, skills: ['Stunt work', 'horse back riding', 'rowing'], availability: ['Everyday'], productions: [wednesday] },
    { email: 'extra2@example.com', name: 'Sam Rivera',   age: 34, gender: 'MALE',   heightCm: 180, skills: ['sign language', 'martial arts'], availability: ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays'], productions: [wednesday] },
    { email: 'extra3@example.com', name: 'Priya Nair',   age: 22, gender: 'FEMALE', heightCm: 165, skills: ['dancing'], availability: ['Tuesdays', 'Thursdays'], productions: [bloodaxe] },
    { email: 'extra4@example.com', name: 'Chris Okafor', age: 41, gender: 'MALE',   heightCm: 175, skills: ['Stunt work', 'boxing'], availability: ['Everyday'], productions: [bloodaxe] },
    { email: 'extra5@example.com', name: 'Taylor Kim',   age: 27, gender: 'MALE',   heightCm: 168, skills: ['singing', 'sign language', 'Stunt work'], availability: ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays'], productions: [wednesday, bloodaxe] },
  ];

  const extras = [];
  for (const data of extrasData) {
    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash: password,
        name: data.name,
        role: 'EXTRA',
        phone: '555-0101',
        extraProfile: {
          create: {
            age: data.age,
            gender: data.gender,
            heightCm: data.heightCm,
            skills: data.skills,
            availability: data.availability,
            // link this profile to its production(s)
            productions: { connect: data.productions.map((p) => ({ id: p.id })) },
          },
        },
      },
      include: { extraProfile: { include: { productions: true } } },
    });
    extras.push(user);
  }

  // helper: is this extra linked to this production?
  const isOn = (extra, production) =>
    extra.extraProfile.productions.some((p) => p.id === production.id);

  // ----- Shoot days -----
  const wednesdayUpcoming = await prisma.shootDay.create({
    data: {
      productionId: wednesday.id,
      date: new Date(Date.now() + 7 * DAY), // 1 week from now
      location: 'Riverside Studios',
      createdById: wednesdayAdmin.id,
    },
  });

  const wednesdayPast = await prisma.shootDay.create({
    data: {
      productionId: wednesday.id,
      date: new Date(Date.now() - 7 * DAY), // 1 week ago
      location: 'Old Backlot',
      createdById: wednesdayAdmin.id,
    },
  });

  const bloodaxeUpcoming = await prisma.shootDay.create({
    data: {
      productionId: bloodaxe.id,
      date: new Date(Date.now() + 10 * DAY), // 10 days from now
      location: 'Harbour Set',
      createdById: bloodaxeAdmin.id,
    },
  });

  // ----- Call requests + invites (only extras on that production) -----
  const wedStunts = await prisma.callRequest.create({
    data: {
      shootDayId: wednesdayUpcoming.id,
      description: 'Stunt scene extras needed',
      quantityNeeded: 2,
      criteria: { minAge: 25, maxAge: 45, skills: ['Stunt work'] },
    },
  });

  const wedCourtroom = await prisma.callRequest.create({
    data: {
      shootDayId: wednesdayPast.id,
      description: 'Background - courtroom scene',
      quantityNeeded: 3,
      criteria: {},
    },
  });

  const bloodaxeRaid = await prisma.callRequest.create({
    data: {
      shootDayId: bloodaxeUpcoming.id,
      description: 'Viking raiders - beach fight',
      quantityNeeded: 2,
      criteria: { gender: 'MALE', skills: ['Stunt work'] },
    },
  });

  const invite = (callRequest, extra) =>
    prisma.callInvite.create({
      data: { callRequestId: callRequest.id, extraProfileId: extra.extraProfile.id },
    });

  for (const extra of extras) {
    const hasStunts = extra.extraProfile.skills.includes('Stunt work');
    if (isOn(extra, wednesday) && hasStunts) await invite(wedStunts, extra);
    if (isOn(extra, wednesday)) await invite(wedCourtroom, extra);
    if (isOn(extra, bloodaxe) && hasStunts && extra.extraProfile.gender === 'MALE') {
      await invite(bloodaxeRaid, extra);
    }
  }

  console.log('Seed complete!');
  console.log('Coordinator logins (password123):');
  console.log('  wednesday@example.com -> Wednesday season 3');
  console.log('  bloodaxe@example.com  -> Bloodaxe season 2');
  console.log('Extra logins: extra1-5@example.com / password123');
  console.log('  extra1, extra2 -> Wednesday | extra3, extra4 -> Bloodaxe | extra5 -> both');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });