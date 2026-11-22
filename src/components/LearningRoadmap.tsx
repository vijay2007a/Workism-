import { useId } from 'react';
import { Check, Lock, Play } from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from 'react-router';
import { useI18n } from '../lib/i18n';
import { lessonState, type LessonState } from '../lib/progress';
import { useWorkspace } from '../lib/workspace';
import type { Course } from '../services';

const LOOK: Record<LessonState, { color: string; label: string; icon: typeof Check }> = {
  done: { color: '#48cfc6', label: 'Done', icon: Check },
  current: { color: '#8a63fb', label: 'Up next', icon: Play },
  locked: { color: '#b9bdd6', label: 'Locked', icon: Lock },
};

/** Lessons as floating drops along a liquid path. Finished stretches of the path are filled. */
export function LearningRoadmap({ course }: { course: Course }) {
  const { t, number } = useI18n();
  const { lessonsDone } = useWorkspace();
  const id = useId();
  const lessons = course.modules.flatMap((m) => m.lessons);
  const n = lessons.length;
  // A gentle wave across; phones use the vertical list layout in layout.css instead.
  const x = (i: number) => (n === 1 ? 50 : 8 + (84 * i) / (n - 1));
  const y = (i: number) => (i % 2 ? 66 : 28);
  let path = `M${x(0) * 10} ${y(0) * 2.6}`;
  for (let i = 1; i < n; i++) {
    const mid = (x(i - 1) + x(i)) * 5;
    path += `C${mid} ${y(i - 1) * 2.6} ${mid} ${y(i) * 2.6} ${x(i) * 10} ${y(i) * 2.6}`;
  }
  const reached = lessons.filter((l) => lessonsDone.includes(l.id)).length;

  return (
    <div className="lg-roadmap">
      <svg viewBox="0 0 1000 260" preserveAspectRatio="none" className="lg-roadmap-path" aria-hidden>
        <defs>
          <linearGradient id={id}>
            <stop stopColor="#48cfc6" />
            <stop offset=".5" stopColor="#7aa8ff" />
            <stop offset="1" stopColor="#a679ff" />
          </linearGradient>
        </defs>
        <path d={path} fill="none" stroke="rgb(255 255 255 / .55)" strokeWidth="15" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <motion.path
          d={path}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth="9"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: n > 1 ? Math.min(1, reached / (n - 1)) : 0 }}
          transition={{ type: 'spring', stiffness: 30, damping: 14, delay: 0.25 }}
        />
      </svg>
      <ol>
        {lessons.map((l, i) => {
          const state = lessonState(course, lessonsDone, l.id);
          const { color, label, icon: Icon } = LOOK[state];
          const body = (
            <>
              <span className="lg-orb floaty" style={{ ['--orb' as string]: color, animationDelay: `${-i * 1.3}s` }} data-current={state === 'current' || undefined}>
                <Icon className="size-[38%]" strokeWidth={2} aria-hidden />
              </span>
              <span className="lg-roadmap-text">
                <span className="block leading-snug font-semibold">{l.title}</span>
                <span className="block text-sm text-ink-soft">
                  {t(label)} · {t('{n} min', { n: number(l.minutes) })}
                </span>
              </span>
            </>
          );
          return (
            <li key={l.id} style={{ ['--x' as string]: `${x(i)}%`, ['--n' as string]: y(i) / 100 }}>
              {state === 'locked' ? (
                <span className="lg-roadmap-node" aria-disabled>
                  {body}
                </span>
              ) : (
                <Link to={`/learn/${course.id}/${l.id}`} className="lg-roadmap-node" aria-current={state === 'current' ? 'step' : undefined}>
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
