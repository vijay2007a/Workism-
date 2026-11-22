import { useRef, useState, type ReactNode } from 'react';
import { Accessibility, ArrowRight, Award, ChartNoAxesColumn, Folder, Globe, Languages, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from 'react-router';
import { CertificatePreview } from '../components/CertificateCard';
import { CourseArt } from '../components/CourseArt';
import { LanguageSelector } from '../components/LanguageSelector';
import { Logo, LogoMark } from '../components/Logo';
import { ProjectTimeline } from '../components/ProjectLabCard';
import { Chip, Orb } from '../glass/controls';
import { LiquidGlassButton } from '../glass/LiquidGlassButton';
import { Aurora } from '../glass/LiquidGlassShell';
import { LiquidProgressBar, ScoreRing } from '../glass/LiquidProgressBar';
import { LiquidSkillBlob } from '../glass/LiquidSkillBlob';
import { useRefraction } from '../glass/refraction';
import { useI18n } from '../lib/i18n';
import { skillColor, useWorkspace } from '../lib/workspace';

function Reveal({ className, children, delay = 0 }: { className?: string; children: ReactNode; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 34 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -80px' }}
      transition={{ type: 'spring', stiffness: 90, damping: 18, delay }}
    >
      {children}
    </motion.div>
  );
}

function TopBar() {
  const { t } = useI18n();
  const ref = useRef<HTMLElement>(null);
  const refraction = useRefraction(ref);
  return (
    <header ref={ref} className="lg-float lg-edge landing-bar">
      {refraction}
      <Link to="/" aria-label="WORKISM" className="flex items-center rounded-full">
        <LogoMark className="h-8 w-auto tab:hidden" />
        <Logo className="text-[1.3rem] max-tab:hidden" />
      </Link>
      <nav aria-label={t('Sections')} className="mx-auto flex gap-1 max-desk:hidden">
        {[['#previews', 'Features'], ['#modules', 'How it works'], ['#sdg4', 'SDG 4']].map(([href, label]) => (
          <a key={href} href={href} className="rounded-full px-4 py-2 font-medium hover:bg-white/60">
            {t(label)}
          </a>
        ))}
      </nav>
      <div className="ms-auto flex items-center gap-2 desk:ms-0">
        <LanguageSelector />
        <LiquidGlassButton variant="ghost" size="sm" to="/login">
          {t('Log in')}
        </LiquidGlassButton>
        <LiquidGlassButton variant="primary" size="sm" to="/register" className="max-[24rem]:hidden">
          {t('Get started')}
        </LiquidGlassButton>
      </div>
    </header>
  );
}

const MODULES = [
  { icon: ChartNoAxesColumn, color: '#a679ff', title: 'Skill Profiling', text: 'Short assessments map what you can do today, and how far each skill is from your goal.' },
  { icon: Sparkles, color: '#48cfc6', title: 'Adaptive AI Learning', text: 'Your path is ordered by those gaps. Lessons unlock as you finish the one before.' },
  { icon: Folder, color: '#6aa9ff', title: 'Project Labs', text: 'Build something real, submit the repository, and get feedback against a published rubric.' },
  { icon: Award, color: '#ef8fc0', title: 'Certificates', text: 'Finish the course, pass the assessment and verify the project. Anyone can check the result.' },
];

const SDG = [
  { icon: Globe, target: '4.3', text: 'Equal access to affordable technical, vocational and higher education.' },
  { icon: Languages, target: '4.4', text: 'Many more people with the skills that work asks for.' },
  { icon: Accessibility, target: '4.5', text: 'The same chance for every learner, including those most often left out.' },
];

export default function Landing() {
  const { t, percent } = useI18n();
  const { skills, certificates, courses, sample } = useWorkspace();
  const [active, setActive] = useState<string | null>(null);
  return (
    <div className="landing">
      <title>{`WORKISM · ${t('Learn by doing. Prove what you know.')}`}</title>
      <Aurora live />
      <TopBar />
      <main>
        <section className="landing-hero">
          <motion.div initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 80, damping: 18 }}>
            <h1 className="text-[clamp(2.6rem,6.2vw,4.9rem)] leading-[1.02] font-bold tracking-[-0.035em] text-balance">{t('Learn by doing. Prove what you know.')}</h1>
            <p className="mt-5 max-w-xl text-[clamp(1.08rem,1.6vw,1.28rem)] leading-relaxed text-ink-soft">
              {t('WORKISM maps your skills, builds a path to your goal, checks real projects, and issues certificates anyone can verify.')}
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <LiquidGlassButton variant="primary" size="lg" to="/register" icon={<ArrowRight className="order-1 rtl:-scale-x-100" aria-hidden />}>
                {t('Get started')}
              </LiquidGlassButton>
              <LiquidGlassButton size="lg" to="/dashboard">
                {t('Explore with sample data')}
              </LiquidGlassButton>
            </div>
          </motion.div>

          <motion.div className="landing-stage" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 60, damping: 16, delay: 0.1 }}>
            <div className="lg-lens">
              <LiquidSkillBlob skills={skills} active={active} onActive={setActive} className="absolute inset-[12%]" />
            </div>
            <div className="lg-panel lg-edge floaty absolute start-0 top-[4%] flex items-center gap-3 rounded-3xl px-4 py-3">
              {skills.slice(0, 1).map((s) => (
                <span key={s.id} className="flex items-center gap-3">
                  <ScoreRing value={s.score} color={skillColor(skills, s.id)} />
                  <span className="leading-tight">
                    <span className="block text-sm">{s.name}</span>
                    <span className="text-lg font-semibold">{percent(s.score)}</span>
                  </span>
                </span>
              ))}
            </div>
            <div className="lg-panel lg-edge floaty absolute end-0 bottom-[3%] w-56 rounded-3xl p-4 [animation-delay:-3s]">
              <p className="mb-2 truncate text-sm font-medium">{courses[0]?.title}</p>
              <LiquidProgressBar value={60} label={t('Example progress')} />
            </div>
            {sample && (
              <Chip tone="warn" className="absolute end-[6%] top-[2%]">
                {t('Example profile')}
              </Chip>
            )}
          </motion.div>
        </section>

        <section id="previews" className="landing-section">
          <Reveal>
            <h2 className="landing-title">{t('See it before you sign up')}</h2>
          </Reveal>
          <div className="grid gap-5 tab:grid-cols-2 desk:grid-cols-3">
            <Reveal className="lg-panel lg-edge lg-light flex flex-col p-6">
              <h3 className="text-xl font-bold">{t('A path that follows you')}</h3>
              <p className="mt-1 text-ink-soft">{t('Five courses to start, reordered as your scores change.')}</p>
              <ul className="mt-5 grid gap-3">
                {courses.slice(0, 3).map((c) => (
                  <li key={c.id} className="lg-inset flex items-center gap-4 p-3">
                    <span className="lg-thumb size-12">
                      <CourseArt skill={c.skill} className="size-8" />
                    </span>
                    <span className="min-w-0 truncate font-medium">{c.title}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal className="lg-panel lg-edge lg-light flex flex-col p-6" delay={0.08}>
              <h3 className="text-xl font-bold">{t('Feedback on real work')}</h3>
              <p className="mt-1 text-ink-soft">{t('Submit a repository. Each step is marked only when it has actually happened.')}</p>
              <div className="my-auto pt-6">
                <ProjectTimeline stage="new" />
              </div>
            </Reveal>
            <Reveal className="lg-panel lg-edge lg-light flex flex-col p-6 tab:col-span-2 desk:col-span-1" delay={0.16}>
              <h3 className="text-xl font-bold">{t('Certificates that can be checked')}</h3>
              <p className="mt-1 mb-5 text-ink-soft">{t('Every certificate carries a code that opens its public status page.')}</p>
              {certificates[0] && <CertificatePreview certificate={certificates[0]} className="mt-auto" />}
            </Reveal>
          </div>
        </section>

        <section id="modules" className="landing-section">
          <Reveal>
            <h2 className="landing-title">{t('Four modules, one loop')}</h2>
          </Reveal>
          <ol className="landing-loop">
            {MODULES.map(({ icon: Icon, color, title, text }, i) => (
              <li key={title}>
                <Reveal delay={i * 0.08} className="flex h-full flex-col items-start gap-4 tab:items-center tab:text-center">
                  <Orb color={color} size="5.6rem">
                    <Icon className="size-[42%]" aria-hidden />
                  </Orb>
                  <div>
                    <h3 className="text-xl font-bold">{t(title)}</h3>
                    <p className="mt-1.5 text-ink-soft">{t(text)}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </section>

        <section id="sdg4" className="landing-section">
          <Reveal className="lg-panel lg-edge landing-sdg">
            <div>
              <p className="text-[clamp(3.6rem,9vw,6.5rem)] leading-none font-extrabold tracking-[-0.05em] text-violet-deep">SDG 4</p>
              <h2 className="mt-2 text-2xl font-bold">{t('Quality education')}</h2>
              <p className="mt-3 max-w-md text-ink-soft">
                {t('The United Nations goal is inclusive, equitable, quality education and lifelong learning for all. WORKISM is designed around three of its targets.')}
              </p>
            </div>
            <ul className="grid gap-4">
              {SDG.map(({ icon: Icon, target, text }) => (
                <li key={target} className="lg-inset flex items-center gap-4 p-4">
                  <Icon className="size-8 flex-none text-violet" strokeWidth={1.4} aria-hidden />
                  <span>
                    <span className="block font-bold">{t('Target {n}', { n: target })}</span>
                    {t(text)}
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>
        </section>
      </main>
      <footer className="landing-footer">
        <Logo className="text-xl" />
        <nav aria-label={t('Footer')} className="flex flex-wrap gap-x-6 gap-y-2 font-medium">
          {[['/dashboard', 'Dashboard'], ['/learn', 'AI Learning Path'], ['/labs', 'Project Labs'], ['/certificates', 'Certificates'], ['/settings', 'Settings']].map(([to, label]) => (
            <Link key={to} to={to} className="hover:underline">
              {t(label)}
            </Link>
          ))}
        </nav>
      </footer>
    </div>
  );
}
