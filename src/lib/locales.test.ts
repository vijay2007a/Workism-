import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LANGS, type Dict } from './lang.ts';

const SRC = join(import.meta.dirname, '..');
const files = readdirSync(SRC, { recursive: true, encoding: 'utf8' });
const source = files
  .filter((f) => /\.tsx?$/.test(f) && !f.includes('locales') && !f.endsWith('.test.ts'))
  .map((f) => readFileSync(join(SRC, f), 'utf8'))
  .join('\n');
const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();

for (const { code } of LANGS.filter((l) => l.code !== 'en')) {
  test(`${code}: every key is a string the app really shows, with its placeholders intact`, async () => {
    const dict = (await import(`../locales/${code}.ts`)).default as Dict;
    assert.ok(Object.keys(dict).length > 80, 'covers the frame and dashboard');
    for (const [key, text] of Object.entries(dict)) {
      assert.ok(source.includes(`'${key}'`) || source.includes(`"${key}"`), `not in the app: ${key}`);
      assert.equal(holes(text), holes(key), key);
      assert.ok(text.trim(), `empty: ${key}`);
    }
  });
}
