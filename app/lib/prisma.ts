// app/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

// Avoid instantiating multiple PrismaClients in dev (HMR)
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Adjust log level as desired; keep quiet in production
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : [],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}