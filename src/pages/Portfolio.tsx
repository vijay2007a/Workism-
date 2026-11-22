import { Award, Folder } from 'lucide-react';
import { CertificatePreview } from '../components/CertificateCard';
import { GitHubConnect } from '../components/GitHubConnect';
import { Avatar } from '../components/LiquidGlassNavbar';
import { PageHeader } from '../components/PageHeader';
import { SampleTag } from '../components/SampleTag';
import { GOALS } from '../data/choices';
import { Chip } from '../glass/controls';
import { LiquidGlassButton } from '../glass/LiquidGlassButton';
import { LiquidGlassPanel } from '../glass/LiquidGlassPanel';
import { LiquidProgressBar } from '../glass/LiquidProgressBar';
import { useI18n } from '../lib/i18n';
import { certificateStatus } from '../lib/progress';
import { useStore } from '../lib/store';
import { useWorkspace } from '../lib/workspace';

export default function Portfolio() {
  const { t, percent } = useI18n();
  const { name, skills, projects, certificates } = useWorkspace();
  const profile = useStore((s) => s.profile);
  const showScores = useStore((s) => s.settings.showScores);
  const goal = GOALS.find(([v]) => v === profile.goal)?.[1];
  // Only work the backend has confirmed belongs in a portfolio.
  const finished = projects.filter((p) => p.status === 'verified');
  const issued = certificates.filter((c) => certificateStatus(c) === 'verified');

  return (
    <>
      <PageHeader title={t('Portfolio')}>
        <SampleTag />
      </PageHeader>
      <div className="grid gap-5">
        <LiquidGlassPanel className="flex flex-wrap items-center gap-6" tint="rgb(206 190 255 / .55)">
          <Avatar name={name} className="size-24 text-4xl" />
          <div className="min-w-0 flex-1">
            <h2 className="text-3xl font-bold tracking-[-0.02em]">{name || t('Student')}</h2>
            <p className="mt-1 text-[1.0625rem] text-ink-soft">{goal ? t(goal) : t('No career goal chosen yet')}</p>
          </div>
          <LiquidGlassButton to="/settings">{t('Edit profile')}</LiquidGlassButton>
        </LiquidGlassPanel>

        <LiquidGlassPanel title={t('Skills')} tint="rgb(176 240 246 / .5)">
          <ul className="grid gap-x-8 gap-y-4 tab:grid-cols-2">
            {skills.map((s) => (
              <li key={s.id}>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <span className="font-medium">{s.name}</span>
                  <span className="flex items-center gap-2.5">
                    <Chip tone={s.source === 'sample' ? 'warn' : 'good'}>{s.source === 'sample' ? t('Sample') : s.source === 'practice' ? t('Practice result') : t('Assessed')}</Chip>
                    {showScores && <span className="font-semibold">{percent(s.score)}</span>}
                  </span>
                </div>
                {showScores && <LiquidProgressBar value={s.score} label={s.name} className="h-3!" />}
              </li>
            ))}
          </ul>
        </LiquidGlassPanel>

        <div className="grid gap-5 desk:grid-cols-2">
          <LiquidGlassPanel title={t('Completed projects')}>
            {finished.length ? (
              <ul className="grid gap-3">
                {finished.map((p) => (
                  <li key={p.id} className="lg-inset p-4">
                    <p className="font-semibold">{p.title}</p>
                    <p className="text-ink-soft">{p.brief}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty icon={<Folder aria-hidden />} text={t('Verified projects appear here.')} to="/labs" action={t('Open Project Labs')} />
            )}
          </LiquidGlassPanel>
          <LiquidGlassPanel title={t('Certificates')}>
            {issued.length ? (
              <ul className="grid gap-4">
                {issued.map((c) => (
                  <li key={c.id}>
                    <CertificatePreview certificate={c} />
                  </li>
                ))}
              </ul>
            ) : (
              <Empty icon={<Award aria-hidden />} text={t('Issued certificates appear here.')} to="/certificates" action={t('See what you can earn')} />
            )}
          </LiquidGlassPanel>
        </div>

        <LiquidGlassPanel title={t('GitHub')}>
          <GitHubConnect />
        </LiquidGlassPanel>
      </div>
    </>
  );
}

const Empty = ({ icon, text, to, action }: { icon: React.ReactNode; text: string; to: string; action: string }) => (
  <div className="flex flex-col items-center gap-4 py-4 text-center [&>svg]:size-10 [&>svg]:stroke-[1.2] [&>svg]:text-violet">
    {icon}
    <p className="text-ink-soft">{text}</p>
    <LiquidGlassButton size="sm" to={to}>
      {action}
    </LiquidGlassButton>
  </div>
);
