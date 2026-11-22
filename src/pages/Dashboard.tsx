import { useId } from 'react';
import { Play, Plus, Sparkle } from 'lucide-react';
import { motion } from 'motion/react';
import { ActiveLearningCard, useActiveCourse } from '../components/ActiveLearningCard';
import { CertificateCard } from '../components/CertificateCard';
import { ProjectLabCard } from '../components/ProjectLabCard';
import { SampleTag } from '../components/SampleTag';
import { SkillProfileCard } from '../components/SkillProfileCard';
import { LiquidGlassButton } from '../glass/LiquidGlassButton';
import { useCalm } from '../lib/effects';
import { useI18n } from '../lib/i18n';
import { useWorkspace } from '../lib/workspace';

/** Two soft swells of gel behind the greeting. Each pair of outlines shares a command structure, so Motion can morph between them. */
const HILL = ['M0 196C66 190 88 66 176 56C258 47 286 136 350 138C396 139 420 116 452 92', 'M0 196C72 186 104 82 184 70C262 58 296 128 356 128C402 128 424 104 452 84'];
const DOME = ['M258 98C280 38 312 10 358 10C404 10 436 42 452 78C434 116 402 142 352 140C312 138 280 124 258 98Z', 'M262 104C278 48 318 22 362 20C408 18 438 50 452 84C436 118 400 134 356 130C316 128 284 124 262 104Z'];
const HILL_BODY = HILL.map((d) => `${d}L452 220L0 220Z`);

function Swells() {
  const id = useId();
  const calm = useCalm();
  const morph = (d: string[], duration: number) => (calm ? {} : { animate: { d: [d[0], d[1], d[0]] }, transition: { duration, repeat: Infinity, ease: 'easeInOut' as const } });
  const box = { x: -20, y: -20, width: 472, height: 240 };
  return (
    <svg className="lg-swells" viewBox="0 0 452 200" preserveAspectRatio="xMaxYMin meet" aria-hidden>
      <defs>
        <linearGradient id={`${id}hill`} x1="70" y1="190" x2="420" y2="80" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f4d3f2" stopOpacity=".15" />
          <stop offset=".24" stopColor="#ecb4ef" stopOpacity=".95" />
          <stop offset=".46" stopColor="#c795f8" />
          <stop offset=".7" stopColor="#a08ff6" stopOpacity=".92" />
          <stop offset="1" stopColor="#8fb2f6" stopOpacity=".8" />
        </linearGradient>
        {/* A bubble: clear in the middle, bright where the wall turns edge-on. */}
        <radialGradient id={`${id}dome`} cx="366" cy="88" r="104" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7fb0e2" stopOpacity=".62" />
          <stop offset=".55" stopColor="#78c4e8" stopOpacity=".72" />
          <stop offset="1" stopColor="#9df0f2" stopOpacity=".98" />
        </radialGradient>
        <radialGradient id={`${id}lit`} cx="146" cy="60" r="96" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff" stopOpacity=".6" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}fold`} cx="262" cy="104" r="76" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7c5df0" stopOpacity=".5" />
          <stop offset="1" stopColor="#7c5df0" stopOpacity="0" />
        </radialGradient>
        {/* Lit at the crest, dissolving toward the foot and the far side. */}
        <linearGradient id={`${id}down`} x2="0" y2="1">
          <stop offset=".46" stopColor="#fff" />
          <stop offset=".98" stopColor="#000" />
        </linearGradient>
        <linearGradient id={`${id}side`}>
          <stop stopColor="#fff" />
          <stop offset=".86" stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
        </linearGradient>
        {/* Two masks, nested: Firefox ignores blend modes inside one. */}
        <mask id={`${id}mdown`}>
          <rect {...box} fill={`url(#${id}down)`} />
        </mask>
        <mask id={`${id}mside`}>
          <rect {...box} fill={`url(#${id}side)`} />
        </mask>
        <filter id={`${id}soft`} x="-10%" y="-20%" width="120%" height="140%">
          <feGaussianBlur stdDeviation="4.5" />
        </filter>
      </defs>
      <g mask={`url(#${id}mside)`}>
        <g mask={`url(#${id}mdown)`}>
          <motion.path d={DOME[0]} fill={`url(#${id}dome)`} {...morph(DOME, 13)} />
          <motion.path d={DOME[0]} fill="none" stroke="#c9fdff" strokeOpacity=".95" strokeWidth="7" filter={`url(#${id}soft)`} {...morph(DOME, 13)} />
          <motion.path d={HILL_BODY[0]} fill={`url(#${id}hill)`} {...morph(HILL_BODY, 11)} />
          <motion.path d={HILL_BODY[0]} fill={`url(#${id}fold)`} {...morph(HILL_BODY, 11)} />
          <motion.path d={HILL_BODY[0]} fill={`url(#${id}lit)`} {...morph(HILL_BODY, 11)} />
          <motion.path d={HILL[0]} fill="none" stroke="#fff" strokeOpacity=".9" strokeWidth="6" filter={`url(#${id}soft)`} {...morph(HILL, 11)} />
          <motion.path d={HILL[0]} fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="1" {...morph(HILL, 11)} />
        </g>
      </g>
    </svg>
  );
}

export default function Dashboard() {
  const { t } = useI18n();
  const { name, courses } = useWorkspace();
  const active = useActiveCourse();
  return (
    <>
      <title>{`${t('Dashboard')} · WORKISM`}</title>
      <div className="dash-top">
        <div className="relative px-1 pt-2 pb-7 tab:ps-3">
          <Swells />
          <div className="relative">
            <h1 className="text-[clamp(1.9rem,3.6vw,2.35rem)] leading-tight font-bold tracking-[-0.02em]">
              {t('Hello, {name}!', { name: name || t('Student') })}{' '}
              <span className="lg-wave" aria-hidden>
                👋
              </span>
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="text-[1.2rem] text-ink-soft">{t('Your personalized AI learning journey')}</p>
              <SampleTag />
            </div>
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-3">
              <LiquidGlassButton
                variant="primary"
                to={active?.next ? `/learn/${active.course.id}/${active.next.id}` : '/learn'}
                icon={<Play className="rtl:-scale-x-100" fill="currentColor" strokeWidth={0} aria-hidden />}
              >
                {t('Continue Learning')}
              </LiquidGlassButton>
              <LiquidGlassButton to="/labs" icon={<Plus aria-hidden />}>
                {t('New Project')}
              </LiquidGlassButton>
              <LiquidGlassButton to="/learn?tab=courses" icon={<Sparkle className="text-violet" aria-hidden />}>
                {t('Explore Courses')}
              </LiquidGlassButton>
            </div>
          </div>
        </div>
        <div className="grid gap-5 desk:grid-cols-2">
          <SkillProfileCard />
          {courses.length > 0 && <ActiveLearningCard />}
        </div>
      </div>
      <div className="dash-bottom">
        <ProjectLabCard />
        <CertificateCard />
      </div>
    </>
  );
}
