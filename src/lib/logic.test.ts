import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkEmail, checkName, checkPassword, checkRepo } from './validate.ts';
import { certificateSteps, certificateStatus, courseProgress, gradeQuiz, lessonState, nextLesson, projectStage, withResults } from './progress.ts';
import { parseState } from './state.ts';
import { dirOf, resolveLang, translate } from './lang.ts';
import { searchItems } from './search.ts';
import { readOutcome } from './runner.ts';

const course = {
  modules: [
    { title: 'One', lessons: [{ id: 'a' }, { id: 'b' }] },
    { title: 'Two', lessons: [{ id: 'c' }] },
  ],
};

test('forms accept good input and explain bad input', () => {
  assert.equal(checkEmail('asha@example.com'), '');
  for (const bad of ['', 'asha', 'asha@', 'a b@c.d', 'asha@example']) assert.notEqual(checkEmail(bad), '');
  assert.equal(checkName('Asha'), '');
  for (const bad of ['', '  ', 'x'.repeat(61)]) assert.notEqual(checkName(bad), '');
  assert.equal(checkPassword('lavender7'), '');
  for (const bad of ['', 'short1', 'onlyletters', '123456789']) assert.notEqual(checkPassword(bad), '');
});

test('a repository link must be an https GitHub owner/repo, because it is rendered as a link', () => {
  assert.equal(checkRepo('https://github.com/asha/portfolio'), '');
  assert.equal(checkRepo('https://github.com/asha/portfolio/'), '');
  for (const bad of ['', 'javascript:alert(1)', 'http://github.com/a/b', 'https://github.com/asha', 'https://github.com.evil.io/a/b', 'https://evil.io/github.com/a/b', 'https://user@github.com/a/b/../../x?y'])
    assert.notEqual(checkRepo(bad), '', bad);
});

test('course progress counts modules whose lessons are all done', () => {
  assert.deepEqual(courseProgress(course, []), { done: 0, total: 2, percent: 0 });
  assert.deepEqual(courseProgress(course, ['a']), { done: 0, total: 2, percent: 33 });
  assert.deepEqual(courseProgress(course, ['a', 'b']), { done: 1, total: 2, percent: 67 });
  assert.deepEqual(courseProgress(course, ['a', 'b', 'c', 'unrelated']), { done: 2, total: 2, percent: 100 });
  assert.deepEqual(courseProgress({ modules: [] }, []), { done: 0, total: 0, percent: 0 });
});

test('lessons unlock in order', () => {
  assert.equal(nextLesson(course, ['a'])?.id, 'b');
  assert.equal(nextLesson(course, ['a', 'b', 'c']), undefined);
  assert.equal(lessonState(course, ['a'], 'a'), 'done');
  assert.equal(lessonState(course, ['a'], 'b'), 'current');
  assert.equal(lessonState(course, ['a'], 'c'), 'locked');
});

test('unanswered questions are marked wrong', () => {
  const qs = [{ answer: 1 }, { answer: 0 }, { answer: 2 }];
  assert.deepEqual(gradeQuiz(qs, [1, undefined, 1]), { correct: 1, total: 3, percent: 33 });
  assert.deepEqual(gradeQuiz([], []), { correct: 0, total: 0, percent: 0 });
});

test('a practice result replaces only its own sample score and says so', () => {
  const sample = [{ id: 'py', name: 'Python', score: 85, source: 'sample' as const }, { id: 'js', name: 'JS', score: 70, source: 'sample' as const }];
  const out = withResults(sample, { js: { percent: 40, at: 1 } });
  assert.deepEqual(out.map((s) => [s.score, s.source]), [[85, 'sample'], [40, 'practice']]);
  assert.equal(sample[1].score, 70);
});

test('only a credential confirmed by the API can read as verified', () => {
  assert.equal(certificateStatus({ status: 'verified', source: 'api' }), 'verified');
  assert.equal(certificateStatus({ status: 'verified', source: 'sample' }), 'preview');
  assert.equal(certificateStatus({ status: 'pending', source: 'api' }), 'pending');
  assert.equal(certificateStatus({ status: 'pending', source: 'sample' }), 'preview');
});

test('saved state survives corruption and older shapes', () => {
  const fresh = parseState(null);
  assert.deepEqual(parseState('{broken'), fresh);
  assert.deepEqual(parseState('null'), fresh);
  assert.deepEqual(parseState('[]'), fresh);
  const kept = parseState('{"profile":{"name":"Asha"},"lessons":["a"],"settings":{"lang":"ta"}}');
  assert.equal(kept.profile.name, 'Asha');
  assert.equal(kept.settings.lang, 'ta');
  assert.equal(kept.settings.motion, fresh.settings.motion);
  assert.deepEqual(kept.lessons, ['a']);
  const wrong = parseState('{"lessons":"a","profile":{"name":7,"interests":null},"quiz":[]}');
  assert.deepEqual(wrong.lessons, []);
  assert.equal(wrong.profile.name, '');
  assert.deepEqual(wrong.profile.interests, []);
  assert.deepEqual(wrong.quiz, {});
});

test('state objects are never shared between loads', () => {
  const a = parseState(null);
  a.lessons.push('x');
  a.profile.interests.push('y');
  assert.deepEqual(parseState(null).lessons, []);
  assert.deepEqual(parseState(null).profile.interests, []);
});

test('translation falls back to the English source and fills placeholders', () => {
  assert.equal(translate({}, 'Hello, {name}!', { name: 'Asha' }), 'Hello, Asha!');
  assert.equal(translate({ 'Hello, {name}!': 'வணக்கம், {name}!' }, 'Hello, {name}!', { name: 'Asha' }), 'வணக்கம், Asha!');
  assert.equal(translate({}, '{a} of {b}', { a: 1 }), '1 of {b}');
  assert.equal(translate({ Save: '' }, 'Save'), 'Save');
});

test('browser language tags resolve to a supported language', () => {
  assert.equal(resolveLang(['ta-IN', 'en']), 'ta');
  assert.equal(resolveLang(['zh-TW']), 'zh');
  assert.equal(resolveLang(['xx', 'fr-CA']), 'fr');
  assert.equal(resolveLang(['xx']), 'en');
  assert.equal(dirOf('ar'), 'rtl');
  assert.equal(dirOf('ta'), 'ltr');
});

test('search ignores case and accents and ranks leading matches first', () => {
  const items = [{ label: 'Advanced Python' }, { label: 'Python' }, { label: 'Résumé builder' }, { label: 'Rust', hint: 'python-like?' }];
  assert.deepEqual(searchItems(items, 'PYTH').map((i) => i.label), ['Python', 'Advanced Python', 'Rust']);
  assert.deepEqual(searchItems(items, 'resume').map((i) => i.label), ['Résumé builder']);
  assert.deepEqual(searchItems(items, '   '), []);
});

test('a project saved on this device is never shown as submitted', () => {
  const saved = { repo: 'https://github.com/a/b', note: '', at: 1 };
  assert.equal(projectStage({}, undefined), 'new');
  assert.equal(projectStage({}, saved), 'saved');
  assert.equal(projectStage({ status: 'evaluated' }, saved), 'evaluated');
  assert.equal(projectStage({ status: 'submitted' }, undefined), 'submitted');
});

test('a certificate needs the whole course, a pass mark of 70, and a verified project', () => {
  const steps = (done: string[], quiz: number | undefined, status?: 'evaluated' | 'verified') =>
    certificateSteps(course, done, quiz === undefined ? undefined : { percent: quiz, at: 1 }, { status }).map((s) => s.done);
  assert.deepEqual(steps([], undefined), [false, false, false]);
  assert.deepEqual(steps(['a', 'b'], 69), [false, false, false]);
  assert.deepEqual(steps(['a', 'b', 'c'], 70), [true, true, false]);
  assert.deepEqual(steps(['a', 'b', 'c'], 100, 'evaluated'), [true, true, false]);
  assert.deepEqual(steps(['a', 'b', 'c'], 100, 'verified'), [true, true, true]);
});

test('only a well-formed answer from the code sandbox is believed', () => {
  assert.deepEqual(readOutcome({ results: [{ ok: true, got: '6' }] }, 1), { results: [{ ok: true, got: '6' }] });
  assert.deepEqual(readOutcome({ results: [{ ok: 'yes', got: 6 }, null] }, 2), { results: [{ ok: false, got: '6' }, { ok: false, got: 'undefined' }] });
  assert.deepEqual(readOutcome({ error: 'SyntaxError' }, 1), { error: 'SyntaxError' });
  for (const bad of [null, 7, 'x', {}, { results: 'x' }, { results: [] }, { error: {} }]) assert.equal(typeof readOutcome(bad, 1).error, 'string');
});
