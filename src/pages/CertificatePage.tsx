import { ArrowRight, Download, Link2, Share2 } from 'lucide-react';
import { useParams } from 'react-router';
import { CertificatePreview, QrCode } from '../components/CertificateCard';
import { PageHeader } from '../components/PageHeader';
import { SampleTag } from '../components/SampleTag';
import { useToast } from '../glass/GlassToast';
import { LiquidGlassButton } from '../glass/LiquidGlassButton';
import { LiquidGlassPanel } from '../glass/LiquidGlassPanel';
import { useI18n } from '../lib/i18n';
import { certificateStatus } from '../lib/progress';
import { useWorkspace } from '../lib/workspace';
import type { Certificate } from '../services';
import { CertificateChecklist, useCertificateSteps } from './Certificates';
import NotFound from './NotFound';

export default function CertificatePage() {
  const { id } = useParams();
  const certificate = useWorkspace().certificates.find((c) => c.id === id);
  return certificate ? <Detail certificate={certificate} /> : <NotFound inside />;
}

function Detail({ certificate }: { certificate: Certificate }) {
  const { t } = useI18n();
  const toast = useToast();
  const issued = certificateStatus(certificate) === 'verified';
  const todo = useCertificateSteps(certificate).find((s) => !s.done);
  const link = `${location.origin}/verify/${certificate.id}`;

  const copy = () =>
    navigator.clipboard.writeText(link).then(
      () => toast(t('Link copied')),
      () => toast(t('The browser blocked copying. The link is in the QR code.'), 'bad'),
    );
  // Cancelling the share sheet rejects; that is not an error.
  const share = () => navigator.share({ title: t(certificate.title), url: link }).catch(() => {});

  return (
    <>
      <PageHeader title={t(certificate.title)} back={{ to: '/certificates', label: t('Certificates') }}>
        <SampleTag />
      </PageHeader>
      <div className="grid items-start gap-5 desk:grid-cols-[minmax(0,1fr)_22rem]">
        <LiquidGlassPanel tint="rgb(150 214 250 / .55)" className="print-me">
          <CertificatePreview certificate={certificate} className="min-h-80 p-7 [&_.lg-certificate-title]:text-3xl" />
        </LiquidGlassPanel>
        <div className="grid gap-5">
          <LiquidGlassPanel title={issued ? t('Share it') : t('To earn this')}>
            {!issued && (
              <>
                <CertificateChecklist certificate={certificate} />
                {todo && (
                  <LiquidGlassButton variant="primary" className="mt-5 w-full" to={todo.to} icon={<ArrowRight className="order-1 rtl:-scale-x-100" aria-hidden />}>
                    {t('Next step')}
                  </LiquidGlassButton>
                )}
                <hr className="my-5 border-white/70" />
              </>
            )}
            <div className="grid gap-3">
              <LiquidGlassButton disabled={!issued} icon={<Download aria-hidden />} onClick={() => print()}>
                {t('Download PDF')}
              </LiquidGlassButton>
              {issued && 'share' in navigator && (
                <LiquidGlassButton icon={<Share2 aria-hidden />} onClick={share}>
                  {t('Share')}
                </LiquidGlassButton>
              )}
              <LiquidGlassButton icon={<Link2 aria-hidden />} onClick={copy}>
                {t('Copy status link')}
              </LiquidGlassButton>
            </div>
            {!issued && <p className="mt-3 text-sm text-ink-soft">{t('Download opens once the certificate has been issued.')}</p>}
          </LiquidGlassPanel>
          <LiquidGlassPanel className="flex justify-center">
            <QrCode id={certificate.id} className="[&_svg]:size-40" />
          </LiquidGlassPanel>
        </div>
      </div>
    </>
  );
}
