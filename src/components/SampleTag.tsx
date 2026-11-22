import type { ReactNode } from 'react';
import { FlaskConical, Unplug } from 'lucide-react';
import { Link } from 'react-router';
import { GlassTooltip } from '../glass/GlassTooltip';
import { useI18n } from '../lib/i18n';
import { useWorkspace } from '../lib/workspace';

/** Shown wherever example records appear, until the API is connected. */
export function SampleTag() {
  const { t } = useI18n();
  if (!useWorkspace().sample) return null;
  return (
    <GlassTooltip text={t('These records are examples, not your results. Connect the WORKISM API to see your own.')} side="bottom">
      <Link to="/settings?tab=integrations" className="lg-chip" data-tone="warn">
        <FlaskConical aria-hidden />
        {t('Sample data')}
      </Link>
    </GlassTooltip>
  );
}

/** Says plainly what a screen still needs from the backend. */
export function NeedsIntegration({ children }: { children: ReactNode }) {
  return (
    <p className="lg-inset flex items-start gap-3 rounded-2xl px-4 py-3 text-[0.9375rem]">
      <Unplug className="mt-0.5 size-5 flex-none text-[#8a5a00]" strokeWidth={1.7} aria-hidden />
      <span>{children}</span>
    </p>
  );
}
