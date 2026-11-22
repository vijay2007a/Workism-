import { useMemo } from 'react';
import { BadgeCheck, CircleDashed, Clock, ExternalLink, ShieldAlert } from 'lucide-react';
import { encode } from 'uqr';
import { Chip } from '../glass/controls';
import { LiquidGlassButton } from '../glass/LiquidGlassButton';
import { LiquidGlassPanel, PanelLink } from '../glass/LiquidGlassPanel';
import { cn } from '../lib/cn';
import { useI18n } from '../lib/i18n';
import { certificateStatus, type CertificateState } from '../lib/progress';
import { useWorkspace } from '../lib/workspace';
import type { Certificate } from '../services';
import { Logo } from './Logo';

const STATUS: Record<CertificateState, { label: string; tone?: 'good' | 'warn'; icon: typeof BadgeCheck }> = {
  verified: { label: 'Verified', tone: 'good', icon: BadgeCheck },
  pending: { label: 'Awaiting verification', tone: 'warn', icon: Clock },
  revoked: { label: 'Revoked', tone: 'warn', icon: ShieldAlert },
  preview: { label: 'Preview, not issued', icon: CircleDashed },
};

export function CertificateStatus({ certificate }: { certificate: Pick<Certificate, 'status' | 'source'> }) {
  const { t } = useI18n();
  const { label, tone, icon: Icon } = STATUS[certificateStatus(certificate)];
  return (
    <Chip tone={tone} icon={<Icon aria-hidden />}>
      {t(label)}
    </Chip>
  );
}

const Laurel = ({ className }: { className?: string }) => (
  <svg viewBox="-34 -32 68 62" className={className} fill="currentColor" aria-hidden>
    {[1, -1].map((side) => (
      <g key={side} transform={`scale(${side} 1)`}>
        <path d="M2 24A25 25 0 0 0 15-21" fill="none" stroke="currentColor" strokeWidth="1.1" />
        {Array.from({ length: 7 }, (_, i) => {
          const a = ((72 - i * 21) * Math.PI) / 180;
          const turn = 72 - i * 21;
          return [20, 28].map((r, k) => (
            <ellipse key={`${i}${r}`} rx="5" ry="1.9" transform={`translate(${r * Math.cos(a) - 2} ${r * Math.sin(a)}) rotate(${turn - (k ? 62 : 118)})`} />
          ));
        })}
      </g>
    ))}
  </svg>
);

/** The certificate itself. The status chip is derived, so a preview can never look issued. */
export function CertificatePreview({ certificate, className }: { certificate: Certificate; className?: string }) {
  const { t, date } = useI18n();
  const { name, skills } = useWorkspace();
  const skill = skills.find((s) => s.id === certificate.skill)?.name ?? '';
  return (
    <article className={cn('lg-certificate lg-edge', className)} aria-label={t(certificate.title)}>
      <svg className="lg-certificate-waves" viewBox="0 0 300 90" preserveAspectRatio="none" aria-hidden>
        <path d="M0 46C52 12 96 22 142 46S240 78 300 36V90H0Z" fill="rgb(214 176 255 / .55)" />
        <path d="M0 66C60 34 112 62 168 66S262 50 300 60V90H0Z" fill="rgb(196 214 255 / .6)" />
        <path d="M0 46C52 12 96 22 142 46S240 78 300 36" fill="none" stroke="#fff" strokeOpacity=".9" />
      </svg>
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <Logo className="text-[0.95rem]" />
        <CertificateStatus certificate={certificate} />
      </header>
      <div className="mt-4">
        <p className="lg-certificate-title text-[1.2rem] leading-tight font-bold">{t(certificate.title)}</p>
        <p className="mt-0.5 text-[0.9375rem] font-medium text-violet-deep">{skill}</p>
      </div>
      <footer className="mt-auto flex items-end justify-between gap-3 pt-5 text-[0.8125rem] text-ink-soft">
        <span>
          <span className="block font-semibold text-ink">{name || t('Your name appears here')}</span>
          {certificateStatus(certificate) === 'verified' && certificate.issuedAt ? t('Issued {date}', { date: date(certificate.issuedAt) }) : t('Signed on issue')}
        </span>
        <Laurel className="h-14 flex-none text-[#8f86d8]" />
      </footer>
    </article>
  );
}

/** A real code: it opens the public status page for this credential. */
export function QrCode({ id, className }: { id: string; className?: string }) {
  const { t } = useI18n();
  const { path, size } = useMemo(() => {
    const qr = encode(`${location.origin}/verify/${id}`, { ecc: 'M', border: 1 });
    let d = '';
    qr.data.forEach((row, y) => row.forEach((on, x) => on && (d += `M${x} ${y}h1v1h-1z`)));
    return { path: d, size: qr.size };
  }, [id]);
  return (
    <figure className={cn('flex flex-col items-center gap-2 text-center', className)}>
      <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={t('QR code for the status page of this certificate')} className="lg-qr" shapeRendering="crispEdges">
        <path d={path} fill="#1d1b3a" />
      </svg>
      <figcaption className="max-w-32 text-[0.8125rem] leading-snug text-ink-soft">{t('Scan to check status')}</figcaption>
    </figure>
  );
}

export function CertificateCard({ className }: { className?: string }) {
  const { t } = useI18n();
  const { certificates } = useWorkspace();
  const certificate = certificates.find((c) => certificateStatus(c) === 'verified') ?? certificates[0];
  if (!certificate) return null;
  return (
    <LiquidGlassPanel
      className={`flex flex-col ${className ?? ''}`}
      title={t('Verification / Certificate')}
      tint="rgb(150 214 250 / .7)"
      action={<PanelLink to={`/certificates/${certificate.id}`} label={t('Open {title}', { title: t(certificate.title) })} />}
    >
      <div className="flex items-center gap-5 max-tab:flex-col">
        <CertificatePreview certificate={certificate} className="min-w-0 flex-1 max-tab:w-full" />
        <QrCode id={certificate.id} className="flex-none" />
      </div>
      <div className="mt-auto pt-6">
        <LiquidGlassButton className="w-full" to="/certificates" icon={<ExternalLink aria-hidden />}>
          {t('View All Certificates')}
        </LiquidGlassButton>
      </div>
    </LiquidGlassPanel>
  );
}
