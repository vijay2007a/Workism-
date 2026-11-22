import { Play, RotateCcw } from 'lucide-react';
import { LiquidGlassButton } from '../glass/LiquidGlassButton';
import { LiquidGlassPanel, PanelLink } from '../glass/LiquidGlassPanel';
import { LiquidProgressBar } from '../glass/LiquidProgressBar';
import { useI18n } from '../lib/i18n';
import { courseProgress, nextLesson } from '../lib/progress';
import { useWorkspace } from '../lib/workspace';
import { CourseArt } from './CourseArt';

/** The course to resume: one already started and unfinished, else the first unfinished, else the first. */
export function useActiveCourse() {
  const { courses, lessonsDone } = useWorkspace();
  const rated = courses.map((c) => ({ course: c, progress: courseProgress(c, lessonsDone), next: nextLesson(c, lessonsDone) }));
  return rated.find((c) => c.next && c.progress.percent > 0) ?? rated.find((c) => c.next) ?? rated[0];
}

export function ActiveLearningCard({ className }: { className?: string }) {
  const { t, percent, number } = useI18n();
  const active = useActiveCourse();
  if (!active) return null;
  const { course, progress, next } = active;
  return (
    <LiquidGlassPanel
      className={`flex flex-col ${className ?? ''}`}
      caustic
      title={t('Active AI Learning')}
      tint="rgb(206 190 255 / .5)"
      action={<PanelLink to={`/learn/${course.id}`} label={t('Open {title}', { title: course.title })} />}
    >
      <div className="lg-inset p-5">
        <div className="flex items-center gap-5">
          <span className="lg-thumb size-[4.6rem]">
            <CourseArt skill={course.skill} className="size-[72%]" />
          </span>
          <div className="min-w-0">
            <p className="text-[0.9375rem] text-ink-soft">{t('Current course')}</p>
            <h3 className="text-xl leading-snug font-semibold">{course.title}</h3>
          </div>
        </div>
        <hr className="my-4 border-white/70" />
        <p className="mb-3 text-[0.9375rem]">
          <span className="text-ink-soft">{next ? t('Current lesson') : t('Course complete')}</span>
          {next && <span className="block truncate text-[1.0625rem] font-medium">{next.title}</span>}
        </p>
        <LiquidProgressBar value={progress.percent} label={t('{title} progress', { title: course.title })} />
        <div className="mt-2.5 flex justify-between gap-3 text-[0.9375rem]">
          <span className="text-ink-soft">{t('{done} of {total} modules completed', { done: number(progress.done), total: number(progress.total) })}</span>
          <span className="font-bold text-violet-deep">{percent(progress.percent)}</span>
        </div>
      </div>
      <div className="relative mt-auto pt-6">
        <LiquidGlassButton
          variant="primary"
          tone="aqua"
          size="lg"
          className="w-full"
          to={next ? `/learn/${course.id}/${next.id}` : `/learn/${course.id}`}
          icon={next ? <Play className="rtl:-scale-x-100" fill="currentColor" strokeWidth={0} aria-hidden /> : <RotateCcw aria-hidden />}
        >
          {next ? t('Resume Learning') : t('Review course')}
        </LiquidGlassButton>
      </div>
    </LiquidGlassPanel>
  );
}
