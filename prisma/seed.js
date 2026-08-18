const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

async function main() {
  const password = await bcrypt.hash('password123', SALT_ROUNDS);

  // ----- Admin / coordinator -----
  const admin = await prisma.user.create({
    data: {
      email: 'coordinator@example.com',
      passwordHash: password,
      name: 'Amy Coordinator',
      role: 'ADMIN',
      phone: '555-0100',
    },
  });

  // ----- Extras -----
  const extrasData = [
    { email: 'extra1@example.com', name: 'Jordan Lee', age: 29, gender: 'FEMALE', heightCm: 171, skills: ['Stunt work', 'horse back riding', 'rowing'], availability: 'Every day' },
    { email: 'extra2@example.com', name: 'Sam Rivera', age: 34, gender: 'MALE', heightCm: 180, skills: ['sign language', 'martial arts'], availability: 'Weekdays' },
    { email: 'extra3@example.com', name: 'Priya Nair', age: 22, gender: 'FEMALE', heightCm: 165, skills: ['dancing'], availability: 'Weekends' },
    { email: 'extra4@example.com', name: 'Chris Okafor', age: 41, gender: 'MALE', heightCm: 175, skills: ['Stunt work', 'boxing'], availability: 'Every day' },
    { email: 'extra5@example.com', name: 'Taylor Kim', age: 27, gender: 'NON_BINARY', heightCm: 168, skills: ['singing', 'sign language'], availability: 'Weekdays' },
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
          },
        },
      },
      include: { extraProfile: true },
    });
    extras.push(user);
  }

  // ----- Shoot days -----
  const upcomingShootDay = await prisma.shootDay.create({
    data: {
      productionName: 'Midnight Run',
      date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week from now
      location: 'Riverside Studios',
      createdById: admin.id,
    },
  });

  const pastShootDay = await prisma.shootDay.create({
    data: {
      productionName: 'The Long Wait (wrapped)',
      date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 1 week ago
      location: 'Old Backlot',
      createdById: admin.id,
    },
  });

  // ----- Call requests (with matching invites) -----
  const callRequest1 = await prisma.callRequest.create({
    data: {
      shootDayId: upcomingShootDay.id,
      description: 'Stunt scene extras needed',
      quantityNeeded: 2,
      criteria: { minAge: 25, maxAge: 45, skills: ['Stunt work'] },
    },
  });

  const callRequest2 = await prisma.callRequest.create({
    data: {
      shootDayId: pastShootDay.id,
      description: 'Background — courtroom scene',
      quantityNeeded: 3,
      criteria: {},
    },
  });

  // Invite the extras who match each call request's criteria
  const stuntExtras = extras.filter((e) =>
    e.extraProfile.skills.includes('Stunt work')
  );
  for (const extra of stuntExtras) {
    await prisma.callInvite.create({
      data: { callRequestId: callRequest1.id, extraProfileId: extra.extraProfile.id },
    });
  }

  for (const extra of extras) {
    await prisma.callInvite.create({
      data: { callRequestId: callRequest2.id, extraProfileId: extra.extraProfile.id },
    });
  }

  console.log('Seed complete!');
  console.log('Admin login: coordinator@example.com / password123');
  console.log('Extra logins: extra1@example.com through extra5@example.com / password123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });