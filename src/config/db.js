const { PrismaClient } = require('@prisma/client');

// Reuse a single Prisma Client instance across the app instead of
// creating a new one per request (this avoids exhausting Postgres
// connections during development with hot-reloading).
const prisma = new PrismaClient();

module.exports = prisma;
