import { useMemo, useState } from 'react';
import { ArrowRight, BotMessageSquare, CodeXml, Play, Sparkles } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { CourseArt } from '../components/CourseArt';
import { LearningRoadmap } from '../components/LearningRoadmap';
import { PageHeader } from '../components/PageHeader';
import { SampleTag } from '../components/SampleTag';
import { Chip, Orb } from '../glass/controls';
import { useToast } from '../glass/GlassToast';
import { LiquidGlassButton } from '../glass/LiquidGlassButton';
import { LiquidGlassPanel } from '../glass/LiquidGlassPanel';
import { LiquidGlassTabs } from '../glass/LiquidGlassTabs';
import { LiquidProgressBar } from '../glass/LiquidProgressBar';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { courseProgress, nextLesson } from '../lib/progress';
import { useStore } from '../lib/store';
import { useWorkspace } from '../lib/workspace';
import { api, type Course } from '../services';

/** Unfinished courses first, then by how far their skill is from its goal. Interests break ties. */
export function useRankedCourses() {
  const { courses, skills, lessonsDone } = useWorkspace();
  const interests = useStore((s) => s.profile.interests);
  return useMemo(() => {
    const gap = (c: Course) => {
      const s = skills.find((k) => k.id === c.skill);
      return (s ? s.target - s.score : 0) + (interests.includes(c.skill) ? 0.5 : 0);
    };
    return courses
      .map((course) => ({ course, progress: courseProgress(course, lessonsDone), next: nextLesson(course, lessonsDone) }))
      .sort((a, b) => Number(!a.next) - Number(!b.next) || gap(b.course) - gap(a.course));
  }, [courses, skills, lessonsDone, interests]);
}

export default function Learn() {
  const { t, percent, lang } = useI18n();
  const { authenticated } = useAuth();
  const { roadmap, retry } = useWorkspace();
  const goal = useStore((s) => s.profile.goal);
  const toast = useToast();
  const [generating, setGenerating] = useState(false);
  const [params, setParams] = useSearchParams();
  const ranked = useRankedCourses();
  const tab = params.get('tab') === 'courses' ? 'courses' : 'roadmap';
  const picked = ranked.find((r) => r.course.id === params.get('course')) ?? ranked[0];
  const set = (patch: Record<string, string>) => setParams({ ...Object.fromEntries(params), ...patch }, { replace: true });

  const buildRoadmap = async () => {
    setGenerating(true);
    try {
      await api.generateRoadmap(goal || undefined, lang);
      toast('Personalized AI roadmap updated.');
      retry();
    } catch {
      toast('Sign in to generate a personalized Gemini roadmap.', 'info');
    }
    setGenerating(false);
  };

  return (
    <>
      <PageHeader title={t('AI Learning Path')} subtitle={t('Ordered by how far each skill is from its goal.')}>
        <SampleTag />
        {authenticated && (
          <LiquidGlassButton size="sm" loading={generating} onClick={() => void buildRoadmap()} icon={<Sparkles aria-hidden />}>
            Refresh AI Roadmap
          </LiquidGlassButton>
        )}
      </PageHeader>
      {roadmap && (
        <LiquidGlassPanel className="mb-5" tint="rgb(176 240 246 / .45)" title="AI Personalized Plan">
          <p className="text-ink-soft">{roadmap.summary}</p>
        </LiquidGlassPanel>
      )}
      <LiquidGlassTabs
        label={t('View')}
        tabs={[
          { id: 'roadmap', label: t('Roadmap') },
          { id: 'courses', label: t('Courses') },
        ]}
        value={tab}
        onChange={(v) => set({ tab: v })}
      >
        {tab === 'roadmap' && picked && (
          <div className="grid gap-5">
            <LiquidGlassPanel
              key={picked.course.id}
              tint="rgb(206 190 255 / .5)"
              title={picked.course.title}
              action={<Chip tone="violet">{percent(picked.progress.percent)}</Chip>}
            >
              <div className="-mt-1 mb-4 flex flex-wrap gap-2">
                {ranked.map(({ course }) => (
                  <button key={course.id} type="button" className="lg-chip lg-choice min-h-9! text-sm!" aria-pressed={course.id === picked.course.id} onClick={() => set({ course: course.id })}>
                    {course.title}
                  </button>
                ))}
              </div>
              <LearningRoadmap course={picked.course} />
              <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
                <p className="max-w-lg text-ink-soft">{picked.course.blurb}</p>
                <LiquidGlassButton
                  variant="primary"
                  to={picked.next ? `/learn/${picked.course.id}/${picked.next.id}` : `/learn/${picked.course.id}`}
                  icon={<Play className="rtl:-scale-x-100" fill="currentColor" strokeWidth={0} aria-hidden />}
                >
                  {picked.next ? t('Continue') : t('Review course')}
                </LiquidGlassButton>
              </div>
            </LiquidGlassPanel>
            <div className="grid gap-5 tab:grid-cols-2">
              <Entry to="/assistant" icon={<BotMessageSquare className="size-[44%]" aria-hidden />} color="#a679ff" title={t('Ask the AI tutor')} text={t('Stuck on a lesson? Ask without leaving your path.')} />
              <Entry to="/learn/languages" icon={<CodeXml className="size-[44%]" aria-hidden />} color="#6aa9ff" title={t('Choose a programming language')} text={t('Set the one your challenges open with.')} />
            </div>
          </div>
        )}
        {tab === 'courses' && (
          <ul className="grid gap-5 desk:grid-cols-2">
            {ranked.map(({ course, progress, next }, i) => {
              const action = next ? (progress.percent ? t('Keep learning') : t('Start')) : t('Review');
              return (
              <li key={course.id}>
                <LiquidGlassPanel className="flex h-full gap-5 p-4! max-[30rem]:flex-col" transition={{ type: 'spring', stiffness: 150, damping: 20, delay: i * 0.05 }}>
                  <span className="lg-course-art" data-skill={course.skill}>
                    <CourseArt skill={course.skill} className="size-24" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col py-1 pe-1">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-lg leading-snug font-bold">{course.title}</h2>
                      <Chip>{t(course.level)}</Chip>
                    </div>
                    <p className="mt-1 mb-3 text-[0.9375rem] text-ink-soft">{course.blurb}</p>
                    <div className="mt-auto">
                      <div className="mb-1.5 flex justify-end text-sm font-semibold text-violet-deep">{percent(progress.percent)}</div>
                      <LiquidProgressBar value={progress.percent} label={t('{title} progress', { title: course.title })} className="h-3!" />
                      <LiquidGlassButton
                        size="sm"
                        className="mt-4"
                        to={next ? `/learn/${course.id}/${next.id}` : `/learn/${course.id}`}
                        aria-label={`${action}: ${course.title}`}
                        icon={<ArrowRight className="order-1 rtl:-scale-x-100" aria-hidden />}
                      >
                        {action}
                      </LiquidGlassButton>
                    </div>
                  </div>
                </LiquidGlassPanel>
              </li>
              );
            })}
          </ul>
        )}
      </LiquidGlassTabs>
    </>
  );
}

function Entry({ to, icon, color, title, text }: { to: string; icon: React.ReactNode; color: string; title: string; text: string }) {
  return (
    <Link to={to} className="lg-panel lg-edge lg-light flex items-center gap-5 p-5 transition-transform duration-300 hover:-translate-y-0.5">
      <Orb color={color} size="4rem">
        {icon}
      </Orb>
      <span>
        <span className="block text-lg font-bold">{title}</span>
        <span className="text-ink-soft">{text}</span>
      </span>
    </Link>
  );
}
