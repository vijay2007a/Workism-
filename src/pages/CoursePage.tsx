import { useState } from 'react';
import { ArrowRight, BotMessageSquare, Check, CircleAlert, Lock, Play } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Link, useNavigate, useParams } from 'react-router';
import { RichText } from '../components/AIAssistantPanel';
import { useFrame } from '../components/AppLayout';
import { CourseArt } from '../components/CourseArt';
import { LearningRoadmap } from '../components/LearningRoadmap';
import { PageHeader } from '../components/PageHeader';
import { SampleTag } from '../components/SampleTag';
import { useToast } from '../glass/GlassToast';
import { LiquidGlassButton } from '../glass/LiquidGlassButton';
import { LiquidGlassPanel } from '../glass/LiquidGlassPanel';
import { LiquidProgressBar } from '../glass/LiquidProgressBar';
import { useAuth } from '../lib/auth';
import { cn } from '../lib/cn';
import { useI18n } from '../lib/i18n';
import { courseProgress, lessonState, nextLesson } from '../lib/progress';
import { notify, setState } from '../lib/store';
import { useWorkspace } from '../lib/workspace';
import { api, type Course, type Lesson, type Question } from '../services';
import NotFound from './NotFound';

export default function CoursePage() {
  const { courseId, lessonId } = useParams();
  const { courses } = useWorkspace();
  const course = courses.find((c) => c.id === courseId);
  if (!course) return <NotFound inside />;
  const lesson = course.modules.flatMap((m) => m.lessons).find((l) => l.id === lessonId);
  if (lessonId && !lesson) return <NotFound inside />;
  return lesson ? <LessonPlayer key={lesson.id} course={course} lesson={lesson} /> : <Overview course={course} />;
}

function Overview({ course }: { course: Course }) {
  const { t, percent, number } = useI18n();
  const { lessonsDone } = useWorkspace();
  const progress = courseProgress(course, lessonsDone);
  const next = nextLesson(course, lessonsDone);
  return (
    <>
      <PageHeader title={course.title} subtitle={course.blurb} back={{ to: '/learn?tab=courses', label: t('All courses') }}>
        <SampleTag />
      </PageHeader>
      <LiquidGlassPanel tint="rgb(206 190 255 / .5)">
        <div className="mb-6 flex flex-wrap items-center gap-5">
          <span className="lg-thumb size-20">
            <CourseArt skill={course.skill} className="size-[72%]" />
          </span>
          <div className="min-w-52 flex-1">
            <div className="mb-2 flex justify-between gap-3">
              <span className="text-ink-soft">{t('{done} of {total} modules completed', { done: number(progress.done), total: number(progress.total) })}</span>
              <span className="font-bold text-violet-deep">{percent(progress.percent)}</span>
            </div>
            <LiquidProgressBar value={progress.percent} label={t('{title} progress', { title: course.title })} />
          </div>
        </div>
        <LearningRoadmap course={course} />
        <div className="mt-6 flex flex-wrap gap-3">
          {next ? (
            <LiquidGlassButton variant="primary" to={`/learn/${course.id}/${next.id}`} icon={<Play className="rtl:-scale-x-100" fill="currentColor" strokeWidth={0} aria-hidden />}>
              {progress.percent ? t('Continue') : t('Start course')}
            </LiquidGlassButton>
          ) : (
            <LiquidGlassButton variant="primary" to={`/assessments/quiz/${course.skill}`} icon={<ArrowRight className="order-1 rtl:-scale-x-100" aria-hidden />}>
              {t('Take the assessment')}
            </LiquidGlassButton>
          )}
        </div>
      </LiquidGlassPanel>
    </>
  );
}

function LessonPlayer({ course, lesson }: { course: Course; lesson: Lesson }) {
  const { t, number } = useI18n();
  const { authenticated } = useAuth();
  const { lessonsDone, retry } = useWorkspace();
  const toast = useToast();
  const go = useNavigate();
  const state = lessonState(course, lessonsDone, lesson.id);
  const [answered, setAnswered] = useState(false);
  const { openAssistant } = useFrame();
  const all = course.modules.flatMap((m) => m.lessons);
  const current = nextLesson(course, lessonsDone);

  if (state === 'locked') {
    return (
      <LiquidGlassPanel title={t('This lesson is still locked')}>
        <p className="mb-5 text-ink-soft">{t('Lessons open in order. Finish “{title}” first.', { title: current?.title ?? '' })}</p>
        <LiquidGlassButton variant="primary" to={`/learn/${course.id}/${current?.id}`}>
          {t('Go to that lesson')}
        </LiquidGlassButton>
      </LiquidGlassPanel>
    );
  }

  const complete = async () => {
    if (state === 'done') {
      const after = all[all.indexOf(lesson) + 1];
      return go(after ? `/learn/${course.id}/${after.id}` : `/learn/${course.id}`);
    }
    const done = [...lessonsDone, lesson.id];
    setState((s) => ({ lessons: [...new Set([...s.lessons, lesson.id])] }));
    if (authenticated) {
      try {
        await api.completeLesson(course.id, lesson.id, true);
        retry();
      } catch {
        toast('Could not save progress to server.', 'bad');
        return;
      }
    }
    const next = nextLesson(course, done);
    if (next) toast(t('Lesson complete'));
    else {
      toast(t('Course complete'));
      notify({ id: `course-${course.id}`, text: 'You finished a course. Take its assessment next.', to: `/assessments/quiz/${course.skill}` });
    }
    go(next ? `/learn/${course.id}/${next.id}` : `/learn/${course.id}`);
  };

  return (
    <>
      <LiquidGlassButton variant="float" className="lg-fab" aria-label={t('Ask the AI tutor')} icon={<BotMessageSquare className="text-violet" aria-hidden />} onClick={openAssistant} />
      <PageHeader title={lesson.title} back={{ to: `/learn/${course.id}`, label: course.title }}>
        <SampleTag />
      </PageHeader>
      <div className="grid items-start gap-5 desk:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="grid gap-5">
          <LiquidGlassPanel>
            <div className="max-w-[68ch] space-y-4 text-[1.0625rem] leading-relaxed">
              {lesson.body.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
            {lesson.code && (
              <div className="mt-5 max-w-3xl">
                <RichText text={`\`\`\`\n${lesson.code}\n\`\`\``} />
              </div>
            )}
          </LiquidGlassPanel>
          <Practice question={lesson.check} onAnswer={() => setAnswered(true)} />
          <div className="flex flex-wrap items-center gap-4">
            <LiquidGlassButton variant="primary" size="lg" onClick={complete} disabled={state === 'current' && !answered} icon={<ArrowRight className="order-1 rtl:-scale-x-100" aria-hidden />}>
              {state === 'done' ? t('Next lesson') : t('Complete and continue')}
            </LiquidGlassButton>
            {state === 'current' && !answered && <p className="text-ink-soft">{t('Answer the practice question to continue.')}</p>}
          </div>
        </div>
        <LiquidGlassPanel title={t('Lessons')} className="desk:sticky desk:top-6" tint="rgb(206 190 255 / .5)">
          <ol className="grid gap-1">
            {all.map((l) => {
              const s = lessonState(course, lessonsDone, l.id);
              const Icon = s === 'done' ? Check : s === 'locked' ? Lock : Play;
              const inner = (
                <>
                  <Icon className={cn('mt-0.5 size-4.5 flex-none', s === 'done' ? 'text-good' : 'text-ink-soft')} aria-label={t(s === 'done' ? 'Done' : s === 'locked' ? 'Locked' : 'Up next')} />
                  <span className="min-w-0">
                    <span className="block leading-snug font-medium">{l.title}</span>
                    <span className="text-sm text-ink-soft">{t('{n} min', { n: number(l.minutes) })}</span>
                  </span>
                </>
              );
              const row = 'flex gap-3 rounded-2xl px-3 py-2.5';
              return (
                <li key={l.id}>
                  {s === 'locked' ? (
                    <span className={cn(row, 'opacity-75')}>{inner}</span>
                  ) : (
                    <Link to={`/learn/${course.id}/${l.id}`} aria-current={l.id === lesson.id ? 'page' : undefined} className={cn(row, 'hover:bg-white/50 aria-[current]:bg-white/70')}>
                      {inner}
                    </Link>
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

function Practice({ question, onAnswer }: { question: Question; onAnswer: () => void }) {
  const { t } = useI18n();
  const [picked, setPicked] = useState<number>();
  const right = picked === question.answer;
  return (
    <LiquidGlassPanel title={t('Practice')} tint="rgb(190 236 255 / .45)">
      <p className="mb-4 text-[1.0625rem] font-medium">{question.q}</p>
      <div role="group" aria-label={question.q} className="grid gap-2.5">
        {question.options.map((o, i) => (
          <button
            key={o}
            type="button"
            className="lg-option"
            aria-pressed={picked === i}
            data-mark={picked === i ? (right ? 'right' : 'wrong') : undefined}
            onClick={() => {
              setPicked(i);
              onAnswer();
            }}
          >
            {o}
          </button>
        ))}
      </div>
      <div aria-live="polite">
        <AnimatePresence mode="wait">
          {picked !== undefined && (
            <motion.p key={picked} className="mt-4 flex items-start gap-3" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              {right ? <Check className="mt-0.5 size-5 flex-none text-good" aria-hidden /> : <CircleAlert className="mt-0.5 size-5 flex-none text-bad" aria-hidden />}
              <span>
                <strong>{right ? t('That is right.') : t('Not quite.')}</strong> {right ? question.why : t('Have another look, then try a different answer.')}
              </span>
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </LiquidGlassPanel>
  );
}
