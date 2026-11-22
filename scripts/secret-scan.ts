import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

interface Finding { file: string; line: number; rule: string }

const RULES: { name: string; pattern: RegExp }[] = [
  { name: 'Private key block', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/ },
  { name: 'Google / Gemini API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'Vercel access token', pattern: /\b(?:vcp_|vercel_(?:live|api)_)[A-Za-z0-9_-]{24,}\b/ },
  { name: 'Google OAuth client secret', pattern: /\bGOCSPX-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'GitHub PAT', pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b/ },
  { name: 'Supabase secret key', pattern: /\bsb_secret_[A-Za-z0-9_-]{20,}\b/ },
  { name: 'JWT / Supabase service_role token', pattern: /\beyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/ },
  { name: 'OpenAI / Stripe style secret', pattern: /\b(?:sk_live|sk_test|sk-proj)-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'Postgres connection URL with password', pattern: /postgres(?:ql)?:\/\/[^:\s]+:(?!replace_me|password|postgres|example|your[_-])[A-Za-z0-9!@#$%^&*._-]{8,}@/i },
  { name: 'Hardcoded server secret assignment', pattern: /\b(?:GEMINI_API_KEY|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|CERTIFICATE_SIGNING_SECRET)\s*=\s*['"]?(?!replace_|your_|test[-_]|dummy|example|process\.env)[A-Za-z0-9+/=_-]{16,}/ },
];

const FORBIDDEN_FILENAMES = /(?:^|[\\/])(?:\.env(?!\.example$)(?:\.[^\\/]+)?|[^\\/]+\.(?:pem|key|p12|pfx|sqlite|sqlite3|db|bak|backup))$/i;
const SKIP_DIRS = new Set(['node_modules', '.git', 'coverage', '.temp']);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (st.isFile()) out.push(full);
  }
  return out;
}

function listTargetFiles(root: string, mode: 'staged' | 'all' | 'dist'): string[] {
  if (mode === 'dist') return existsSync(join(root, 'dist')) ? walk(join(root, 'dist')) : [];
  if (mode === 'staged') {
    const raw = execFileSync('git', ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMRT'], { cwd: root, encoding: 'utf8' });
    return raw.split('\0').filter(Boolean).map((p) => join(root, p));
  }
  return walk(root).filter((p) => !relative(root, p).startsWith('dist'));
}

function historicalBlobs(root: string) {
  const objects = execFileSync('git', ['rev-list', '--objects', '--all'], { cwd: root, encoding: 'utf8' });
  const checked = execFileSync('git', ['cat-file', '--batch-check=%(objecttype) %(objectname) %(rest)'], {
    cwd: root, encoding: 'utf8', input: objects,
  });
  return checked.split(/\r?\n/).flatMap((line) => {
    const match = /^blob (\w+) (.+)$/.exec(line);
    return match ? [{ name: match[2], object: match[1] }] : [];
  });
}

export function scanFiles(root: string, mode: 'staged' | 'all' | 'dist' | 'history'): Finding[] {
  const findings: Finding[] = [];
  const files = mode === 'history'
    ? historicalBlobs(root)
    : listTargetFiles(root, mode).map((file) => ({ name: relative(root, file).replaceAll('\\', '/'), object: '' }));
  for (const { name: rel, object } of files) {
    if (mode !== 'dist' && FORBIDDEN_FILENAMES.test(rel)) {
      findings.push({ file: rel, line: 0, rule: 'Forbidden sensitive file staged/present' });
      continue;
    }
    if (rel === 'scripts/secret-scan.ts' || rel.endsWith('.png') || rel.endsWith('.woff2')) continue;
    const content = mode === 'history'
      ? execFileSync('git', ['cat-file', 'blob', object], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      : mode === 'staged'
      ? execFileSync('git', ['show', ':' + rel], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      : readFileSync(join(root, rel), 'utf8');
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const rule of RULES) {
        if (rule.pattern.test(line)) findings.push({ file: rel, line: i + 1, rule: rule.name });
      }
      if (mode === 'dist' && /\b(?:SUPABASE_SECRET_KEY|GEMINI_API_KEY|CERTIFICATE_SIGNING_SECRET|DATABASE_URL)\b/.test(line)) {
        findings.push({ file: rel, line: i + 1, rule: 'Server-only env var name leaked in client bundle' });
      }
    }
  }
  return findings;
}

if (import.meta.main) {
  const arg = process.argv[2];
  const mode = arg === '--staged' ? 'staged' : arg === '--dist' ? 'dist' : arg === '--history' ? 'history' : 'all';
  const findings = scanFiles(process.cwd(), mode);
  if (findings.length > 0) {
    console.error(`Secret scan (${mode}) FAILED with ${findings.length} finding(s):`);
    for (const f of findings) console.error(`  - ${f.file}:${f.line} [${f.rule}]`);
    process.exit(1);
  }
  console.log(`Secret scan (${mode}) PASSED: 0 findings.`);
}
