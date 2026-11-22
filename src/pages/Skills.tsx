import { lazy, Suspense, useState } from 'react';
import { ArrowRight, TrendingUp } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { PageHeader } from '../components/PageHeader';
import { SampleTag } from '../components/SampleTag';
import { useSkillInsight } from '../components/SkillProfileCard';
import { Chip } from '../glass/controls';
import { LiquidGlassButton } from '../glass/LiquidGlassButton';
import { LiquidGlassPanel } from '../glass/LiquidGlassPanel';
import { LiquidGlassTabs } from '../glass/LiquidGlassTabs';
import { LiquidSkillBlob } from '../glass/LiquidSkillBlob';
import { ScoreRing } from '../glass/LiquidProgressBar';
import { useI18n } from '../lib/i18n';
import { skillColor, useWorkspace } from '../lib/workspace';
import type { Skill } from '../services';

const SkillRadar = lazy(() => import('../components/SkillCharts').then((m) => ({ default: m.SkillRadar })));
const History = lazy(() => import('../components/SkillCharts').then((m) => ({ default: m.History })));

export default function Skills() {
  const { t, percent } = useI18n();
  const { skills, courses } = useWorkspace();
  const [params] = useSearchParams();
  const [active, setActive] = useState<string | null>(params.get('focus'));
  const [tab, setTab] = useState<'radar' | 'compare' | 'history'>('radar');
  const insight = useSkillInsight();
  const byGap = [...skills].sort((a, b) => b.target - b.score - (a.target - a.score));
  const strengths = skills.filter((s) => s.score >= s.target);
  const gaps = byGap.filter((s) => s.score < s.target);

  return (
    <>
      <PageHeader title={t('Skill Profiling')} subtitle={insight}>
        <SampleTag />
      </PageHeader>
      <div className="grid gap-5 desk:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <LiquidGlassPanel title={t('Your shape')} tint="rgb(176 240 246 / .55)" className="flex flex-col">
          <div className="grid flex-1 place-items-center px-4 pt-6 pb-10 tab:px-20">
            <LiquidSkillBlob skills={skills} active={active} onActive={setActive} detailed className="w-full max-w-[24rem]" />
          </div>
          <p className="text-[0.9375rem] text-ink-soft">{t('Each lobe reaches further as its score rises. White pins mark the exact score; the outer ring is 100 and the dotted ring is 50. Touch or click the jelly.')}</p>
        </LiquidGlassPanel>

        <LiquidGlassPanel title={t('Skills')} tint="rgb(214 176 255 / .45)">
          <ul className="grid gap-2">
            {skills.map((s) => (
              <li key={s.id} className="lg-skill-row gap-4! py-2!" data-active={active === s.id || undefined} onPointerEnter={() => setActive(s.id)} onPointerLeave={() => setActive(null)}>
                <ScoreRing value={s.score} color={skillColor(skills, s.id)} className="size-12" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[1.0625rem] font-medium">{s.name}</span>
                  <span className="block text-sm text-ink-soft">{t('Goal {p}', { p: percent(s.target) })}</span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  <span className="text-2xl leading-none font-semibold">{percent(s.score)}</span>
                  <span className="text-xs text-ink-soft">{s.source === 'sample' ? t('Sample') : s.source === 'practice' ? t('Practice result') : t('Assessed')}</span>
                </span>
              </li>
            ))}
          </ul>
          <LiquidGlassButton className="mt-5 w-full" to="/assessments" icon={<TrendingUp aria-hidden />}>
            {t('Take an assessment')}
          </LiquidGlassButton>
        </LiquidGlassPanel>

        <LiquidGlassPanel title={t('Analytics')} className="desk:col-span-2">
          <LiquidGlassTabs
            label={t('Analytics')}
            tabs={[
              { id: 'radar', label: t('Radar') },
              { id: 'compare', label: t('Against goals') },
              { id: 'history', label: t('History') },
            ]}
            value={tab}
            onChange={setTab}
          >
            <Suspense fallback={<div className="lg-skeleton h-[26rem]" role="status" aria-label={t('Loading')} />}>
              {tab === 'radar' && <SkillRadar skills={skills} />}
              {tab === 'compare' && <Compare skills={skills} />}
              {tab === 'history' && <History skills={skills} />}
            </Suspense>
          </LiquidGlassTabs>
        </LiquidGlassPanel>

        <LiquidGlassPanel title={t('Strengths')} tint="rgb(160 236 220 / .55)">
          {strengths.length ? (
            <ul className="grid gap-3">
              {strengths.map((s) => (
                <li key={s.id} className="lg-inset flex items-center justify-between gap-3 px-4 py-3">
                  <span className="font-medium">{s.name}</span>
                  <Chip tone="good">{t('{n} above goal', { n: percent(s.score - s.target) })}</Chip>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-soft">{t('No skill has reached its goal yet.')}</p>
          )}
        </LiquidGlassPanel>

        <LiquidGlassPanel title={t('Gaps and what to do next')} tint="rgb(255 206 226 / .5)">
          <ul className="grid gap-3">
            {gaps.map((s) => {
              const course = courses.find((c) => c.skill === s.id);
              return (
                <li key={s.id} className="lg-inset flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <span>
                    <span className="block font-medium">{s.name}</span>
                    <span className="text-sm text-ink-soft">{t('{n} to go', { n: percent(s.target - s.score) })}</span>
                  </span>
                  {course && (
                    <LiquidGlassButton size="sm" to={`/learn/${course.id}`} icon={<ArrowRight className="order-1 rtl:-scale-x-100" aria-hidden />}>
                      {course.title}
                    </LiquidGlassButton>
                  )}
                </li>
              );
            })}
            {gaps.length === 0 && <li className="text-ink-soft">{t('Every skill has reached its goal.')}</li>}
          </ul>
        </LiquidGlassPanel>
      </div>
    </>
  );
}

function Compare({ skills }: { skills: Skill[] }) {
  const { t, percent } = useI18n();
  return (
    <ul className="grid gap-5 py-2">
      {skills.map((s) => (
        <li key={s.id}>
          <div className="mb-1.5 flex justify-between gap-3">
            <span className="font-medium">{s.name}</span>
            <span>
              <strong>{percent(s.score)}</strong> <span className="text-ink-soft">/ {t('Goal {p}', { p: percent(s.target) })}</span>
            </span>
          </div>
          <div className="lg-compare" role="img" aria-label={`${s.name}: ${percent(s.score)}. ${t('Goal {p}', { p: percent(s.target) })}`}>
            <span className="lg-compare-fill" style={{ width: `${s.score}%`, background: skillColor(skills, s.id) }} />
            <span className="lg-compare-goal" style={{ insetInlineStart: `${s.target}%` }} />
          </div>
        </li>
      ))}
      <li className="flex items-center gap-2 text-sm text-ink-soft">
        <span className="h-4 w-0.75 rounded-full bg-ink" /> {t('Goal')}
      </li>
    </ul>
  );
}
