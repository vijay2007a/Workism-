import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scanFiles } from '../../scripts/secret-scan.ts';

const ROOT = join(import.meta.dirname, '..', '..');

test('vercel.json configures Vite build, API rewrite, SPA fallback, and strict security headers without secrets', () => {
  const raw = readFileSync(join(ROOT, 'vercel.json'), 'utf8');
  const cfg = JSON.parse(raw) as {
    framework: string;
    buildCommand: string;
    outputDirectory: string;
    rewrites: { source: string; destination: string }[];
    headers: { source: string; headers: { key: string; value: string }[] }[];
  };
  assert.equal(cfg.framework, 'vite');
  assert.equal(cfg.outputDirectory, 'dist');
  assert.ok(cfg.rewrites.some((r) => r.source === '/api/(.*)' && r.destination === '/api/index'));
  assert.ok(cfg.rewrites.some((r) => r.destination === '/index.html'));

  const secHeaders = cfg.headers[0]?.headers ?? [];
  const names = new Set(secHeaders.map((h) => h.key));
  for (const required of ['Content-Security-Policy', 'Strict-Transport-Security', 'X-Frame-Options', 'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy']) {
    assert.ok(names.has(required), `missing header ${required}`);
  }
  assert.doesNotMatch(raw, /GEMINI_API_KEY|SUPABASE_SECRET_KEY|CERTIFICATE_SIGNING_SECRET|service_role/i);
});

test('browser client code never references server-only secret environment variables', () => {
  const findings = scanFiles(ROOT, 'all');
  assert.deepEqual(findings, []);
  if (existsSync(join(ROOT, 'dist'))) {
    const distFindings = scanFiles(ROOT, 'dist');
    assert.deepEqual(distFindings, []);
  }
});
