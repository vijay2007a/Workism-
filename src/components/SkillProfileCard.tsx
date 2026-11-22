import { useState } from 'react';
import { Sparkle } from 'lucide-react';
import { Link } from 'react-router';
import { LiquidGlassPanel, PanelLink } from '../glass/LiquidGlassPanel';
import { LiquidSkillBlob } from '../glass/LiquidSkillBlob';
import { ScoreRing } from '../glass/LiquidProgressBar';
import { useI18n } from '../lib/i18n';
import { skillColor, useWorkspace } from '../lib/workspace';

/** Plain arithmetic on the scores shown: strongest skill, and the one furthest from its goal. */
export function useSkillInsight() {
  const { t } = useI18n();
  const { skills } = useWorkspace();
  if (skills.length === 0) return '';
  const best = skills.reduce((a, b) => (b.score > a.score ? b : a));
  const gap = skills.reduce((a, b) => (b.target - b.score > a.target - a.score ? b : a));
  return gap.target > gap.score
    ? t('{best} is your strongest skill. {gap} is furthest from its goal, so start there next.', { best: best.name, gap: gap.name })
    : t('Every skill has reached its goal. {best} leads.', { best: best.name });
}

export function SkillProfileCard({ className }: { className?: string }) {
  const { t, percent } = useI18n();
  const { skills } = useWorkspace();
  const [active, setActive] = useState<string | null>(null);
  const insight = useSkillInsight();
  return (
    <LiquidGlassPanel
      className={className}
      caustic
      title={t('Skill Profile')}
      tint="rgb(176 240 246 / .6)"
      action={<PanelLink to="/skills" label={t('Open Skill Profiling')} />}
    >
      <div className="flex items-center gap-5 max-tab:flex-col">
        <LiquidSkillBlob skills={skills} active={active} onActive={setActive} className="w-full max-w-[17.5rem] flex-none tab:w-[54%]" />
        <ul className="grid min-w-0 flex-1 gap-1 max-tab:w-full max-tab:grid-cols-2">
          {skills.map((s) => {
            const color = skillColor(skills, s.id);
            return (
              <li key={s.id}>
                <Link
                  to={`/skills?focus=${s.id}`}
                  className="lg-skill-row"
                  data-active={active === s.id || undefined}
                  onPointerEnter={() => setActive(s.id)}
                  onPointerLeave={() => setActive(null)}
                  onFocus={() => setActive(s.id)}
                  onBlur={() => setActive(null)}
                >
                  <ScoreRing value={s.score} color={color} />
                  <span className="min-w-0">
                    <span className="block truncate text-[0.9375rem] leading-tight">{s.name}</span>
                    <span className="block text-[1.3rem] leading-tight font-bold" style={{ color: `color-mix(in oklab, ${color} 80%, #1b1440)` }}>
                      {percent(s.score)}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="lg-inset lg-insight mt-4 flex gap-4 px-5 py-4">
        <Sparkle className="mt-0.5 size-7 flex-none text-[#7a4df2]" strokeWidth={1.7} aria-hidden />
        <div>
          <h3 className="font-semibold text-violet-deep">{t('AI Skill Insight')}</h3>
          <p className="text-[0.9375rem] leading-snug text-ink-soft">{insight}</p>
        </div>
      </div>
    </LiquidGlassPanel>
  );
}
