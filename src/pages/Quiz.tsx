import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CircleAlert, RotateCcw, Timer } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useParams } from 'react-router';
import { PageHeader } from '../components/PageHeader';
import { SampleTag } from '../components/SampleTag';
import { Chip } from '../glass/controls';
import { LiquidGlassButton } from '../glass/LiquidGlassButton';
import { LiquidGlassPanel } from '../glass/LiquidGlassPanel';
import { ScoreRing } from '../glass/LiquidProgressBar';
import { cn } from '../lib/cn';
import { useI18n } from '../lib/i18n';
import { gradeQuiz, PASS_MARK } from '../lib/progress';
import { notify, setState } from '../lib/store';
import { skillColor, useWorkspace } from '../lib/workspace';
import type { Question } from '../services';
import NotFound from './NotFound';

export const QUIZ_MINUTES = 5;

export default function Quiz() {
  const { skillId } = useParams();
  const { courses, skills } = useWorkspace();
  const skill = skills.find((s) => s.id === skillId);
  const questions = useMemo(() => courses.filter((c) => c.skill === skillId).flatMap((c) => c.modules.flatMap((m) => m.lessons.map((l) => l.check))), [courses, skillId]);
  const [run, setRun] = useState(0); // each attempt remounts the sheet
  if (!skill || questions.length === 0) return <NotFound inside />;
  return <Sheet key={run} skill={skill} questions={questions} color={skillColor(skills, skill.id)} again={() => setRun(run + 1)} />;
}

function Sheet({ skill, questions, color, again }: { skill: { id: string; name: string }; questions: Question[]; color: string; again: () => void }) {
  const { t, number, percent } = useI18n();
  const [phase, setPhase] = useState<'ready' | 'running' | 'done'>('ready');
  const [answers, setAnswers] = useState<(number | undefined)[]>([]);
  const [at, setAt] = useState(0);
  const [left, setLeft] = useState(QUIZ_MINUTES * 60);
  const heading = useRef<HTMLHeadingElement>(null);
  const grade = gradeQuiz(questions, answers);

  // The clock runs from a deadline, so a throttled tab cannot slow it down.
  useEffect(() => {
    if (phase !== 'running') return;
    const deadline = Date.now() + QUIZ_MINUTES * 60_000;
    const id = setInterval(() => {
      const s = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) setPhase('done');
    }, 500);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'done') return;
    setState((s) => ({ quiz: { ...s.quiz, [skill.id]: { percent: grade.percent, at: Date.now() } } }));
    notify({ id: `quiz-${skill.id}`, text: 'Your practice result has updated your skill profile.', to: `/skills?focus=${skill.id}` });
    // The result is recorded once, when the sheet is handed in.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    if (phase !== 'ready') heading.current?.focus();
  }, [phase, at]);

  if (phase === 'ready') {
    return (
      <>
        <PageHeader title={t('{skill} quiz', { skill: skill.name })} back={{ to: '/assessments', label: t('Assessments') }}>
          <SampleTag />
        </PageHeader>
        <LiquidGlassPanel className="max-w-2xl">
          <ul className="mb-6 grid gap-2.5 text-[1.0625rem]">
            <li>{t('{n} questions, {m} minutes', { n: number(questions.length), m: number(QUIZ_MINUTES) })}</li>
            <li>{t('You can move between questions and change answers until you hand in.')}</li>
            <li>{t('This is practice: it is not supervised and does not issue a certificate by itself.')}</li>
          </ul>
          <LiquidGlassButton variant="primary" size="lg" onClick={() => setPhase('running')}>
            {t('Start the clock')}
          </LiquidGlassButton>
        </LiquidGlassPanel>
      </>
    );
  }

  if (phase === 'done') {
    const passed = grade.percent >= PASS_MARK;
    return (
      <>
        <PageHeader title={t('{skill} results', { skill: skill.name })} back={{ to: '/assessments', label: t('Assessments') }} />
        <div className="grid gap-5">
          <LiquidGlassPanel className="flex flex-wrap items-center gap-6">
            <ScoreRing value={grade.percent} color={color} className="size-32" />
            <div className="flex-1">
              <h2 ref={heading} tabIndex={-1} className="text-4xl font-bold outline-none">
                {percent(grade.percent)}
              </h2>
              <p className="mt-1 mb-3 text-[1.0625rem] text-ink-soft">{t('{n} of {total} correct', { n: number(grade.correct), total: number(grade.total) })}</p>
              <Chip tone={passed ? 'good' : 'warn'}>{passed ? t('Reaches the pass mark') : t('Pass mark is {p}', { p: percent(PASS_MARK) })}</Chip>
            </div>
            <div className="flex flex-wrap gap-3">
              <LiquidGlassButton icon={<RotateCcw aria-hidden />} onClick={again}>
                {t('Try again')}
              </LiquidGlassButton>
              <LiquidGlassButton variant="primary" to={`/skills?focus=${skill.id}`}>
                {t('See my profile')}
              </LiquidGlassButton>
            </div>
          </LiquidGlassPanel>
          <ol className="grid gap-4">
            {questions.map((q, i) => {
              const right = answers[i] === q.answer;
              return (
                <li key={q.q} className="lg-panel lg-edge rounded-3xl p-5">
                  <p className="flex gap-3 font-semibold">
                    {right ? <Check className="mt-0.5 size-5 flex-none text-good" aria-label={t('Correct')} /> : <CircleAlert className="mt-0.5 size-5 flex-none text-bad" aria-label={t('Incorrect')} />}
                    {q.q}
                  </p>
                  <p className="ms-8 mt-2">
                    <span className="text-ink-soft">{t('Answer:')}</span> {q.options[q.answer]}
                  </p>
                  {!right && answers[i] !== undefined && (
                    <p className="ms-8">
                      <span className="text-ink-soft">{t('You chose:')}</span> {q.options[answers[i]]}
                    </p>
                  )}
                  <p className="ms-8 mt-1 text-ink-soft">{q.why}</p>
                </li>
              );
            })}
          </ol>
        </div>
      </>
    );
  }

  const q = questions[at];
  const answered = answers.filter((a) => a !== undefined).length;
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  return (
    <>
      <PageHeader title={t('{skill} quiz', { skill: skill.name })}>
        <span className={cn('lg-chip min-h-10! px-4! text-base! tabular-nums', left <= 30 && 'text-bad!')} role="timer" aria-label={t('Time left')}>
          <Timer aria-hidden />
          {clock}
        </span>
      </PageHeader>
      <div className="grid items-start gap-5 desk:grid-cols-[minmax(0,1fr)_16rem]">
        <LiquidGlassPanel>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={at} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -18, transition: { duration: 0.1 } }}>
              <p className="text-ink-soft">{t('Question {n} of {total}', { n: number(at + 1), total: number(questions.length) })}</p>
              <h2 ref={heading} tabIndex={-1} className="mt-1 mb-5 text-2xl leading-snug font-bold outline-none">
                {q.q}
              </h2>
              <div role="radiogroup" aria-label={q.q} className="grid gap-3">
                {q.options.map((o, i) => (
                  <label key={o} className="lg-option" data-on={answers[at] === i || undefined}>
                    <input type="radio" name={`q${at}`} className="sr-only" checked={answers[at] === i} onChange={() => setAnswers(Array.from({ length: questions.length }, (_, k) => (k === at ? i : answers[k])))} />
                    {o}
                  </label>
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
          <div className="mt-7 flex justify-between gap-3">
            <LiquidGlassButton disabled={at === 0} onClick={() => setAt(at - 1)} icon={<ArrowLeft className="rtl:-scale-x-100" aria-hidden />}>
              {t('Back')}
            </LiquidGlassButton>
            {at < questions.length - 1 ? (
              <LiquidGlassButton variant="primary" onClick={() => setAt(at + 1)} icon={<ArrowRight className="order-1 rtl:-scale-x-100" aria-hidden />}>
                {t('Next')}
              </LiquidGlassButton>
            ) : (
              <LiquidGlassButton variant="primary" onClick={() => setPhase('done')}>
                {t('Hand in')}
              </LiquidGlassButton>
            )}
          </div>
        </LiquidGlassPanel>
        <LiquidGlassPanel title={t('Questions')} tint="rgb(206 190 255 / .5)">
          <ol className="flex flex-wrap gap-2">
            {questions.map((x, i) => (
              <li key={x.q}>
                <button
                  type="button"
                  className="lg-chip lg-choice relative size-11 justify-center px-0!"
                  aria-pressed={i === at}
                  aria-label={`${t('Question {n} of {total}', { n: number(i + 1), total: number(questions.length) })}${answers[i] === undefined ? '' : `, ${t('answered')}`}`}
                  onClick={() => setAt(i)}
                >
                  {number(i + 1)}
                  {answers[i] !== undefined && i !== at && <span className="absolute bottom-1 size-1.5 rounded-full bg-violet" />}
                </button>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-[0.9375rem] text-ink-soft">{t('{n} of {total} answered', { n: number(answered), total: number(questions.length) })}</p>
          <LiquidGlassButton className="mt-4 w-full" onClick={() => setPhase('done')}>
            {t('Hand in now')}
          </LiquidGlassButton>
        </LiquidGlassPanel>
      </div>
    </>
  );
}
