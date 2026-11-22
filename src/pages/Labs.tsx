import { Clock, Folder } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { PageHeader } from '../components/PageHeader';
import { STAGE_TEXT } from '../components/ProjectLabCard';
import { SampleTag } from '../components/SampleTag';
import { Chip, Orb } from '../glass/controls';
import { LiquidGlassButton } from '../glass/LiquidGlassButton';
import { LiquidGlassPanel } from '../glass/LiquidGlassPanel';
import { LiquidGlassTabs } from '../glass/LiquidGlassTabs';
import { useI18n } from '../lib/i18n';
import { projectStage } from '../lib/progress';
import { useStore } from '../lib/store';
import { useWorkspace } from '../lib/workspace';

const COLORS = ['#a679ff', '#48cfc6', '#6aa9ff', '#ef8fc0'];

export default function Labs() {
  const { t, number } = useI18n();
  const { projects, skills } = useWorkspace();
  const submissions = useStore((s) => s.submissions);
  const [params, setParams] = useSearchParams();
  const show = params.get('show') === 'mine' ? 'mine' : 'all';
  const rows = projects.map((p, i) => ({ p, stage: projectStage(p, submissions[p.id]), color: COLORS[i % COLORS.length] }));
  const list = show === 'mine' ? rows.filter((r) => r.stage !== 'new') : rows;

  return (
    <>
      <PageHeader title={t('Project Labs')} subtitle={t('Build something real, then have it checked.')}>
        <SampleTag />
      </PageHeader>
      <LiquidGlassTabs
        label={t('Show')}
        tabs={[
          { id: 'all', label: t('All projects') },
          { id: 'mine', label: t('My projects') },
        ]}
        value={show}
        onChange={(v) => setParams(v === 'mine' ? { show: 'mine' } : {}, { replace: true })}
      >
        <ul className="grid gap-5 desk:grid-cols-2">
          {list.map(({ p, stage, color }, i) => (
            <li key={p.id}>
              <LiquidGlassPanel className="flex h-full flex-col gap-4" transition={{ type: 'spring', stiffness: 150, damping: 20, delay: i * 0.05 }}>
                <div className="flex items-start gap-4">
                  <Orb color={color} size="3.6rem">
                    <Folder className="size-[44%]" aria-hidden />
                  </Orb>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl leading-snug font-bold">{p.title}</h2>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-4 text-[0.9375rem] text-ink-soft">
                      <span>{t(p.level)}</span>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="size-4" aria-hidden />
                        {t('About {n} hours', { n: number(p.hours) })}
                      </span>
                    </p>
                  </div>
                  <Chip tone={STAGE_TEXT[stage].tone}>{t(STAGE_TEXT[stage].label)}</Chip>
                </div>
                <p>{p.brief}</p>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex flex-wrap gap-2">
                    {p.skills.map((id) => (
                      <Chip key={id}>{skills.find((s) => s.id === id)?.name ?? id}</Chip>
                    ))}
                  </div>
                  <LiquidGlassButton size="sm" variant={stage === 'new' ? 'primary' : 'secondary'} to={`/labs/${p.id}`} aria-label={`${stage === 'new' ? t('Open brief') : t('Open project')}: ${p.title}`}>
                    {stage === 'new' ? t('Open brief') : t('Open project')}
                  </LiquidGlassButton>
                </div>
              </LiquidGlassPanel>
            </li>
          ))}
        </ul>
        {list.length === 0 && (
          <LiquidGlassPanel className="text-center">
            <p className="mb-5 text-lg">{t('You have not started a project yet.')}</p>
            <LiquidGlassButton variant="primary" onClick={() => setParams({}, { replace: true })}>
              {t('Browse all projects')}
            </LiquidGlassButton>
          </LiquidGlassPanel>
        )}
      </LiquidGlassTabs>
    </>
  );
}
