const { PrismaClient } = require('@prisma/client');

// Singleton: en serverless (Vercel) evita crear múltiples clientes/conexiones
// entre invocaciones reutilizando la instancia en el objeto global.
const globalForPrisma = globalThis;

const prisma = globalForPrisma.__prisma || new PrismaClient();

if (!globalForPrisma.__prisma) {
  globalForPrisma.__prisma = prisma;
}

module.exports = prisma;
