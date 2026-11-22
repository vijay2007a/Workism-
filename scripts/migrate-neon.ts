import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { neon } from '@neondatabase/serverless';

export interface MigrationClient {
  query(text: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
  transaction(statements: { text: string; params?: unknown[] }[]): Promise<unknown>;
}

/** Splits a SQL file into top-level statements while preserving quotes, comments, and $$ blocks. */
export function splitSqlStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = '';
  let i = 0;
  let inSingle = false;
  let dollarTag: string | null = null;

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (!inSingle && !dollarTag && ch === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }
    if (!inSingle && !dollarTag && ch === '/' && next === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (!dollarTag && ch === "'") {
      buf += ch;
      if (inSingle && next === "'") {
        buf += next;
        i += 2;
        continue;
      }
      inSingle = !inSingle;
      i++;
      continue;
    }
    if (!inSingle && ch === '$') {
      const match = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(i));
      if (match) {
        const tag = match[0];
        dollarTag = dollarTag === tag ? null : dollarTag ?? tag;
        buf += tag;
        i += tag.length;
        continue;
      }
    }
    if (!inSingle && !dollarTag && ch === ';') {
      const trimmed = buf.trim();
      if (trimmed) out.push(trimmed);
      buf = '';
      i++;
      continue;
    }
    buf += ch;
    i++;
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}

export async function applyNeonMigrations(
  client: MigrationClient,
  migrationsDir: string,
): Promise<{ applied: string[]; skipped: string[] }> {
  await client.query(
    'create table if not exists public.schema_migrations (version text primary key, applied_at timestamptz not null default now())',
  );
  const existing = await client.query('select version from public.schema_migrations');
  const seen = new Set(existing.map((r) => String(r.version)));

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    if (seen.has(version)) {
      skipped.push(version);
      continue;
    }
    const raw = readFileSync(join(migrationsDir, file), 'utf8');
    const stmts = splitSqlStatements(raw);
    if (stmts.length === 0) continue;

    await client.transaction([
      ...stmts.map((text) => ({ text })),
      { text: 'insert into public.schema_migrations (version) values ($1) on conflict (version) do nothing', params: [version] },
    ]);
    applied.push(version);
  }
  return { applied, skipped };
}

function createNeonMigrationClient(databaseUrl: string): MigrationClient {
  const sql = neon(databaseUrl);
  return {
    async query(text, params = []) {
      return (await sql.query(text, params)) as Record<string, unknown>[];
    },
    async transaction(statements) {
      return await sql.transaction((txn) => statements.map((s) => txn.query(s.text, s.params ?? [])));
    },
  };
}

if (import.meta.main) {
  const databaseUrl = (process.env.DATABASE_URL ?? '').trim();
  if (!databaseUrl) {
    console.error('DATABASE_URL is required to run Neon migrations.');
    process.exit(1);
  }
  const dir = join(process.cwd(), 'neon', 'migrations');
  const result = await applyNeonMigrations(createNeonMigrationClient(databaseUrl), dir);
  console.log(`Neon migrations complete. Applied: ${result.applied.join(', ') || 'none'}. Skipped: ${result.skipped.join(', ') || 'none'}.`);
}
