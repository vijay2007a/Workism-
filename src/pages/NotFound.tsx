import { House } from 'lucide-react';
import { LiquidGlassButton } from '../glass/LiquidGlassButton';
import { LiquidGlassPanel } from '../glass/LiquidGlassPanel';
import { Aurora } from '../glass/LiquidGlassShell';
import { useI18n } from '../lib/i18n';

/** `inside` is for addresses within the workspace, where the frame is already drawn. */
export default function NotFound({ inside }: { inside?: boolean }) {
  const { t } = useI18n();
  const panel = (
    <LiquidGlassPanel className="mx-auto max-w-md py-10 text-center">
      <title>{`${t('There is nothing at this address')} · WORKISM`}</title>
      <h1 className="text-3xl font-bold">{t('There is nothing at this address')}</h1>
      <p className="mt-2 mb-6 text-ink-soft">{t('The link may be old, or mistyped.')}</p>
      <LiquidGlassButton variant="primary" to="/dashboard" icon={<House aria-hidden />}>
        {t('Go to the dashboard')}
      </LiquidGlassButton>
    </LiquidGlassPanel>
  );
  if (inside) return panel;
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <Aurora />
      {panel}
    </main>
  );
}
