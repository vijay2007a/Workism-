import { Fragment } from 'react';
import { ArrowRight, BadgeCheck, Check, CodeXml, Folder, Plus, Sparkles } from 'lucide-react';
import { Chip, Orb } from '../glass/controls';
import { LiquidGlassButton } from '../glass/LiquidGlassButton';
import { LiquidGlassPanel, PanelLink } from '../glass/LiquidGlassPanel';
import { useI18n } from '../lib/i18n';
import { projectStage, type ProjectStage } from '../lib/progress';
import { useStore } from '../lib/store';
import { useWorkspace } from '../lib/workspace';

export const STAGE_TEXT: Record<ProjectStage, { label: string; tone?: 'good' | 'warn' | 'violet' }> = {
  new: { label: 'Not started' },
  saved: { label: 'Saved on this device', tone: 'warn' },
  submitted: { label: 'Submitted', tone: 'violet' },
  evaluating: { label: 'Being evaluated', tone: 'violet' },
  evaluated: { label: 'Evaluated', tone: 'violet' },
  verified: { label: 'Verified', tone: 'good' },
};

const STEPS = [
  { label: 'Submit', icon: CodeXml, color: '#a679ff', after: ['submitted', 'evaluating', 'evaluated', 'verified'] },
  { label: 'Evaluate', icon: Sparkles, color: '#48cfc6', after: ['evaluated', 'verified'] },
  { label: 'Verify', icon: BadgeCheck, color: '#6aa9ff', after: ['verified'] },
];

/** Submit → Evaluate → Verify, as three drops of glass. A tick appears only when the backend confirms a step. */
export function ProjectTimeline({ stage, size = '4.75rem' }: { stage: ProjectStage; size?: string }) {
  const { t } = useI18n();
  return (
    <ol className="flex items-start justify-between gap-1">
      {STEPS.map(({ label, icon: Icon, color, after }, i) => {
        const done = after.includes(stage);
        return (
          <Fragment key={label}>
            {i > 0 && (
              <li className="pt-[1.55rem] text-[#6a6f88]" aria-hidden>
                <ArrowRight className="size-7 rtl:-scale-x-100" strokeWidth={1.2} />
              </li>
            )}
            <li className="flex min-w-0 flex-1 flex-col items-center gap-2.5 text-center">
              <span className="relative">
                <Orb color={color} size={size} className="floaty">
                  <Icon className="size-[44%]" aria-hidden />
                </Orb>
                {done && (
                  <span className="absolute -end-1 -top-1 grid size-6 place-items-center rounded-full bg-good text-white shadow-md">
                    <Check className="size-4" strokeWidth={3} aria-hidden />
                  </span>
                )}
              </span>
              <span className="max-w-full text-[0.9375rem] leading-tight [overflow-wrap:anywhere] tab:text-[1.0625rem]">
                {t(label)}
                {done && <span className="sr-only">: {t('done')}</span>}
              </span>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

export function ProjectLabCard({ className }: { className?: string }) {
  const { t } = useI18n();
  const { projects } = useWorkspace();
  const submissions = useStore((s) => s.submissions);
  // The one in flight, else the first on offer.
  const project = projects.find((p) => p.status && p.status !== 'verified') ?? projects.find((p) => submissions[p.id]) ?? projects[0];
  if (!project) return null;
  const stage = projectStage(project, submissions[project.id]);
  return (
    <LiquidGlassPanel
      className={`flex flex-col ${className ?? ''}`}
      title={t('Project Lab')}
      tint="rgb(214 176 255 / .6)"
      action={<PanelLink to={`/labs/${project.id}`} label={t('Open {title}', { title: project.title })} />}
    >
      <p className="-mt-2 text-[1.0625rem] text-ink-soft">{t('Build · Submit · Get AI Feedback · Verify')}</p>
      <div className="mt-3 mb-5 flex flex-wrap items-center gap-2.5">
        <span className="font-semibold">{project.title}</span>
        <Chip tone={STAGE_TEXT[stage].tone}>{t(STAGE_TEXT[stage].label)}</Chip>
      </div>
      <div className="px-1 tab:px-5">
        <ProjectTimeline stage={stage} />
      </div>
      <div className="mt-auto grid gap-3 pt-7 tab:grid-cols-2">
        <LiquidGlassButton variant="primary" to="/labs" icon={<Plus aria-hidden />}>
          {t('Start New Project')}
        </LiquidGlassButton>
        <LiquidGlassButton to="/labs?show=mine" icon={<Folder aria-hidden />}>
          {t('View My Projects')}
        </LiquidGlassButton>
      </div>
    </LiquidGlassPanel>
  );
}
