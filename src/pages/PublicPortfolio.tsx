import { useEffect, useState } from 'react';
import { BadgeCheck, ExternalLink } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { LanguageSelector } from '../components/LanguageSelector';
import { Avatar } from '../components/LiquidGlassNavbar';
import { Logo } from '../components/Logo';
import { Chip } from '../glass/controls';
import { LiquidGlassButton } from '../glass/LiquidGlassButton';
import { LiquidGlassPanel } from '../glass/LiquidGlassPanel';
import { Aurora } from '../glass/LiquidGlassShell';
import { LiquidProgressBar } from '../glass/LiquidProgressBar';
import { LoadingSkeleton } from '../glass/LoadingSkeleton';
import { useI18n } from '../lib/i18n';
import { api, type PublicPortfolioData } from '../services';

export default function PublicPortfolio() {
  const { t, percent, date } = useI18n();
  const { slug = '' } = useParams();
  const [data, setData] = useState<PublicPortfolioData | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let live = true;
    api.publicPortfolio(slug).then(
      (res) => live && setData(res.portfolio),
      () => live && setMissing(true),
    );
    return () => {
      live = false;
    };
  }, [slug]);

  return (
    <div className="auth">
      <title>{`${data?.displayName || slug} · WORKISM`}</title>
      <Aurora />
      <header className="flex items-center justify-between gap-4">
        <Link to="/" aria-label={t('WORKISM home')} className="rounded-full">
          <Logo className="text-[1.45rem]" />
        </Link>
        <LanguageSelector />
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 py-8">
        {missing ? (
          <LiquidGlassPanel className="text-center">
            <h1 className="text-2xl font-bold">Portfolio not available</h1>
            <p className="mt-2 mb-5 text-ink-soft">This portfolio is either private or does not exist.</p>
            <LiquidGlassButton to="/">{t('About WORKISM')}</LiquidGlassButton>
          </LiquidGlassPanel>
        ) : !data ? (
          <LoadingSkeleton cards={2} />
        ) : (
          <div className="grid gap-5">
            <LiquidGlassPanel className="flex flex-wrap items-center gap-6" tint="rgb(206 190 255 / .55)">
              <Avatar name={data.displayName} className="size-20 text-3xl" />
              <div className="min-w-0 flex-1">
                <h1 className="text-3xl font-bold">{data.displayName || t('Student')}</h1>
                {data.careerGoal && <p className="mt-1 text-ink-soft">{data.careerGoal}</p>}
              </div>
              {data.githubUsername && (
                <LiquidGlassButton size="sm" onClick={() => open(`https://github.com/${data.githubUsername}`, '_blank', 'noopener,noreferrer')} icon={<ExternalLink aria-hidden />}>
                  GitHub
                </LiquidGlassButton>
              )}
            </LiquidGlassPanel>

            <LiquidGlassPanel title={t('Skills')} tint="rgb(176 240 246 / .5)">
              <ul className="grid gap-4 tab:grid-cols-2">
                {data.skills.map((s) => (
                  <li key={s.id}>
                    <div className="mb-1 flex justify-between">
                      <span className="font-medium">{s.name}</span>
                      {data.showScores && s.score !== null && <span className="font-semibold">{percent(s.score)}</span>}
                    </div>
                    {data.showScores && s.score !== null && <LiquidProgressBar value={s.score} label={s.name} className="h-3!" />}
                  </li>
                ))}
              </ul>
            </LiquidGlassPanel>

            <div className="grid gap-5 desk:grid-cols-2">
              <LiquidGlassPanel title={t('Completed projects')}>
                {data.projects.length ? (
                  <ul className="grid gap-3">
                    {data.projects.map((p) => (
                      <li key={p.id} className="lg-inset p-4">
                        <p className="font-semibold">{p.title}</p>
                        <p className="text-sm text-ink-soft">{p.brief}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-ink-soft">{t('Verified projects appear here.')}</p>
                )}
              </LiquidGlassPanel>
              <LiquidGlassPanel title={t('Certificates')}>
                {data.certificates.length ? (
                  <ul className="grid gap-3">
                    {data.certificates.map((c) => (
                      <li key={c.verificationCode} className="lg-inset flex items-center justify-between gap-3 p-4">
                        <div>
                          <p className="font-semibold">{c.title}</p>
                          <p className="text-sm text-ink-soft">{date(new Date(c.issuedAt).getTime())}</p>
                        </div>
                        <Link to={`/verify/${c.verificationCode}`}>
                          <Chip tone="good" icon={<BadgeCheck aria-hidden />}>{t('Verified')}</Chip>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-ink-soft">{t('Issued certificates appear here.')}</p>
                )}
              </LiquidGlassPanel>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
