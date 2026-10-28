import { PrismaClient } from "@prisma/client";
const g = globalThis as unknown as { prisma?: PrismaClient };
export const db = g.prisma ?? new PrismaClient({ log: process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"] });
if (process.env.NODE_ENV !== "production") g.prisma = db;
