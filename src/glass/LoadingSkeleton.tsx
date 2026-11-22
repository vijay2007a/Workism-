import { cn } from '../lib/cn';
import { useI18n } from '../lib/i18n';

/** Frosted placeholders in the shape of a page: a heading, then cards. */
export function LoadingSkeleton({ cards = 4, className }: { cards?: number; className?: string }) {
  const { t } = useI18n();
  return (
    <div role="status" aria-label={t('Loading')} className={cn('grid gap-5 tab:grid-cols-2', className)}>
      <div className="lg-skeleton h-10 w-64 tab:col-span-2" />
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="lg-skeleton h-56" />
      ))}
    </div>
  );
}
