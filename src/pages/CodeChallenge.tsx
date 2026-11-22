import { useId, useState, type KeyboardEvent } from 'react';
import { Check, CircleAlert, Play, RotateCcw } from 'lucide-react';
import { useParams } from 'react-router';
import { PageHeader } from '../components/PageHeader';
import { NeedsIntegration } from '../components/SampleTag';
import { CHALLENGES } from '../data/challenges';
import { PROGRAMMING_LANGUAGES } from '../data/languages';
import { GlassSelect } from '../glass/controls';
import { LiquidGlassButton } from '../glass/LiquidGlassButton';
import { LiquidGlassPanel } from '../glass/LiquidGlassPanel';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { runJs } from '../lib/runner';
import { notify, setState, useStore } from '../lib/store';
import { api } from '../services';
import NotFound from './NotFound';

export default function CodeChallenge() {
  const { t, number } = useI18n();
  const { authenticated } = useAuth();
  const { id } = useParams();
  const editor = useId();
  const challenge = CHALLENGES.find((c) => c.id === id);
  const preferred = useStore((s) => s.profile.codeLang);
  const [lang, setLang] = useState(preferred || 'javascript');
  const [code, setCode] = useState(challenge?.starter ?? '');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Awaited<ReturnType<typeof runJs>>>();
  const [release, setRelease] = useState(false);
  if (!challenge) return <NotFound inside />;
  const language = PROGRAMMING_LANGUAGES.find((l) => l.id === lang)!;

  const run = async () => {
    setBusy(true);
    if (!language.runs && authenticated) {
      try {
        const remote = await api.executeCode(challenge.id, language.id, code);
        setOutcome(remote.publicResults ? { results: remote.publicResults } : { error: remote.error || remote.message || 'Remote sandbox unavailable.' });
      } catch (e) {
        setOutcome({ error: e instanceof Error ? e.message : 'Isolated execution service is unavailable.' });
      }
      setBusy(false);
      return;
    }
    const r = await runJs(code, challenge.fn, challenge.tests);
    setOutcome(r);
    setBusy(false);
    if (!r.results) return;
    const passed = r.results.filter((x) => x.ok).length;
    setState((s) => ({ code: { ...s.code, [challenge.id]: { passed, total: r.results!.length, at: Date.now() } } }));
    if (authenticated) {
      void api.recordCodeSubmission({
        challengeId: challenge.id,
        languageId: language.id,
        code,
        executionMode: 'browser_js',
        passedCount: passed,
        totalCount: r.results.length,
        results: r.results,
      }).catch(() => {});
    }
    if (passed === r.results.length) notify({ id: `code-${challenge.id}`, text: 'All tests passed on a coding challenge.', to: `/assessments/code/${challenge.id}` });
  };

  // Tab indents, as editors do. Escape first releases it, so keyboard users are never trapped.
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') return setRelease(true);
    if (e.key !== 'Tab' || release || e.shiftKey) return setRelease(false);
    e.preventDefault();
    const el = e.currentTarget;
    el.setRangeText('  ', el.selectionStart, el.selectionEnd, 'end');
    setCode(el.value);
  };

  const show = (v: unknown) => JSON.stringify(v);

  return (
    <>
      <PageHeader title={challenge.title} subtitle={challenge.brief} back={{ to: '/assessments', label: t('Assessments') }} />
      <div className="grid items-start gap-5 desk:grid-cols-[minmax(0,1fr)_22rem]">
        <LiquidGlassPanel>
          <div className="mb-4 grid gap-4 tab:grid-cols-[14rem_1fr] tab:items-end">
            <GlassSelect label={t('Language')} value={lang} onChange={setLang} options={PROGRAMMING_LANGUAGES.map((l) => [l.id, l.name] as const)} />
            <div className="flex flex-wrap justify-end gap-3">
              <LiquidGlassButton
                icon={<RotateCcw aria-hidden />}
                onClick={() => {
                  setCode(challenge.starter);
                  setOutcome(undefined);
                }}
              >
                {t('Reset')}
              </LiquidGlassButton>
              <LiquidGlassButton variant="primary" loading={busy} disabled={!language.runs && !authenticated} onClick={run} icon={<Play className="rtl:-scale-x-100" fill="currentColor" strokeWidth={0} aria-hidden />}>
                {t('Run tests')}
              </LiquidGlassButton>
            </div>
          </div>
          <div className="lg-code my-0!" dir="ltr">
            <label htmlFor={editor} className="block px-4 pt-3 text-xs text-[#d8d2f4]">
              {t('Your code')} · {language.name}
            </label>
            <textarea
              id={editor}
              className="block min-h-80 w-full resize-y bg-transparent p-4 font-mono text-[0.9375rem] leading-relaxed text-[#f2efff] outline-offset-[-3px]"
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              aria-describedby={`${editor}-keys`}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={onKey}
            />
          </div>
          <p id={`${editor}-keys`} className="mt-2 text-sm text-ink-soft">
            {t('Tab indents. Press Escape, then Tab, to leave the editor.')}
          </p>
          {!language.runs && (
            <div className="mt-4">
              <NeedsIntegration>{t('{name} is editor-only for now: running it needs the WORKISM execution service. JavaScript runs in this browser.', { name: language.name })}</NeedsIntegration>
            </div>
          )}
        </LiquidGlassPanel>

        <LiquidGlassPanel title={t('Tests')} tint="rgb(190 226 255 / .55)">
          <div aria-live="polite">
            {outcome?.error && (
              <p className="mb-4 flex gap-3 font-medium text-bad">
                <CircleAlert className="mt-0.5 size-5 flex-none" aria-hidden />
                <span className="min-w-0 break-words">{t(outcome.error)}</span>
              </p>
            )}
            {outcome?.results && (
              <p className="mb-4 font-semibold">
                {t('{n} of {total} tests passed', { n: number(outcome.results.filter((r) => r.ok).length), total: number(outcome.results.length) })}
              </p>
            )}
          </div>
          <ol className="grid gap-3">
            {challenge.tests.map((test, i) => {
              const r = outcome?.results?.[i];
              return (
                <li key={show(test.args)} className="lg-inset p-4 text-[0.9375rem]">
                  <div className="flex items-start justify-between gap-3">
                    <code dir="ltr" className="min-w-0 font-mono text-sm break-words">
                      {challenge.fn}({test.args.map(show).join(', ')})
                    </code>
                    {r && (r.ok ? <Check className="size-5 flex-none text-good" aria-label={t('Passed')} /> : <CircleAlert className="size-5 flex-none text-bad" aria-label={t('Failed')} />)}
                  </div>
                  <p className="mt-1.5 text-ink-soft">
                    {t('Expected')} <code dir="ltr" className="font-mono text-sm text-ink">{show(test.expected)}</code>
                  </p>
                  {r && !r.ok && (
                    <p className="text-ink-soft">
                      {t('Got')} <code dir="ltr" className="font-mono text-sm break-words text-bad">{r.got}</code>
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </LiquidGlassPanel>
      </div>
    </>
  );
}
