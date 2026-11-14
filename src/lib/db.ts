/**
 * Divine Sacco Management System — Database client
 *
 * Database strategy:
 *  - LOCAL DEVELOPMENT : SQLite via DATABASE_URL="file:./db/custom.db"
 *  - PRODUCTION (Vercel): Turso (libsql) via TURSO_DATABASE_URL + TURSO_AUTH_TOKEN
 *
 * When TURSO_DATABASE_URL is set the Prisma libsql adapter is used so the
 * schema (provider = "sqlite") works against Turso without any change.
 *
 * For local SQLite, the URL is resolved to an absolute path to avoid
 * "Error code 14: Unable to open the database file" under Next.js runtimes.
 */
import { PrismaClient } from '@prisma/client'
import path from 'path'
import fs from 'fs'

// ── Turso / libsql adapter (production only) ─────────────────────────────────
function createTursoClient(): PrismaClient {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createClient } = require('@libsql/client')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaLibSQL } = require('@prisma/adapter-libsql')
  const libsql = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  })
  const adapter = new PrismaLibSQL(libsql)
  return new PrismaClient({
    adapter,
    log: ['error'],
  } as any)
}

// ── SQLite absolute path resolution (local dev) ───────────────────────────────
function resolveDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL
  if (!raw) return undefined
  if (!raw.startsWith('file:')) return raw // postgres/mysql — untouched

  let p = raw.slice('file:'.length)
  if (p.startsWith('//')) p = p.slice(1)
  if (path.isAbsolute(p)) return raw

  const root = process.cwd()
  const candidates = [
    path.join(root, 'db', 'custom.db'),
    path.join(root, p),
  ]
  for (const c of candidates) {
    try {
      if (fs.statSync(c).isFile()) return `file:${c}`
    } catch { /* keep trying */ }
  }
  return `file:${path.join(root, 'db', 'custom.db')}`
}

// ── Singleton ─────────────────────────────────────────────────────────────────
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createClient(): PrismaClient {
  // Turso takes priority when both env vars are present (Vercel production)
  if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
    return createTursoClient()
  }
  // Local SQLite fallback
  const resolvedUrl = resolveDatabaseUrl()
  return new PrismaClient({
    log: ['error', 'warn'],
    ...(resolvedUrl ? { datasourceUrl: resolvedUrl } : {}),
  })
}

export const db =
  globalForPrisma.prisma ??
  createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
