import { useEffect, useState } from 'react';
import { BadgeCheck, CircleHelp, ShieldAlert } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { LanguageSelector } from '../components/LanguageSelector';
import { Logo } from '../components/Logo';
import { Orb } from '../glass/controls';
import { LiquidGlassButton } from '../glass/LiquidGlassButton';
import { LiquidGlassPanel } from '../glass/LiquidGlassPanel';
import { Aurora } from '../glass/LiquidGlassShell';
import { LoadingSkeleton } from '../glass/LoadingSkeleton';
import { useI18n } from '../lib/i18n';
import { certificateStatus } from '../lib/progress';
import { api, NotConnected, type Certificate } from '../services';

/** Public page behind every QR code. Says "verified" only when the API has just confirmed it. */
export default function Verify() {
  const { t, date } = useI18n();
  const { id = '' } = useParams();
  const [found, setFound] = useState<Certificate>();
  const [problem, setProblem] = useState<'' | 'offline' | 'missing'>('');

  useEffect(() => {
    let live = true;
    api.verifyCertificate(id).then(
      (c) => live && setFound(c),
      (e) => live && setProblem(e instanceof NotConnected ? 'offline' : 'missing'),
    );
    return () => {
      live = false;
    };
  }, [id]);

  const status = found && certificateStatus(found);
  const [Icon, color, title, text] =
    status === 'verified'
      ? ([BadgeCheck, '#3fb8a4', t('Verified'), found?.issuedAt ? t('Issued {date}', { date: date(found.issuedAt) }) : ''] as const)
      : problem === 'offline'
        ? ([CircleHelp, '#e0a94a', t('Cannot be confirmed'), t('The verification service is not connected. Treat this certificate as unverified.')] as const)
        : ([ShieldAlert, '#d8607f', t('Not verified'), status === 'revoked' ? t('This certificate has been revoked.') : t('No issued certificate matches this code.')] as const);

  return (
    <div className="auth">
      <title>{`${t('Certificate code')} ${id} · WORKISM`}</title>
      <Aurora />
      <header className="flex items-center justify-between gap-4">
        <Link to="/" aria-label={t('WORKISM home')} className="rounded-full">
          <Logo className="text-[1.45rem]" />
        </Link>
        <LanguageSelector />
      </header>
      <main className="grid flex-1 place-items-center py-8">
        {found || problem ? (
          <LiquidGlassPanel className="flex w-full max-w-lg flex-col items-center p-8! text-center">
            <Orb color={color} size="6rem">
              <Icon className="size-[46%]" aria-hidden />
            </Orb>
            <h1 className="mt-5 text-3xl font-bold">{title}</h1>
            {found && <p className="mt-2 text-xl font-semibold">{t(found.title)}</p>}
            {found?.holderName && <p className="mt-1 font-medium text-ink">{found.holderName}</p>}
            <p className="mt-2 text-ink-soft">{text}</p>
            {found?.signatureVerified && (
              <p className="mt-2 text-xs text-good">Cryptographic signature verified ({found.signatureAlg ?? 'HMAC-SHA256'})</p>
            )}
            <p className="mt-5 text-sm break-all text-ink-soft">
              {t('Certificate code')}: <code className="font-mono">{id}</code>
            </p>
            <LiquidGlassButton className="mt-6" to="/">
              {t('About WORKISM')}
            </LiquidGlassButton>
          </LiquidGlassPanel>
        ) : (
          <LoadingSkeleton cards={1} className="w-full max-w-lg grid-cols-1!" />
        )}
      </main>
    </div>
  );
}
