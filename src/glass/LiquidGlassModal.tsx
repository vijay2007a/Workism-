import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { LiquidGlassButton } from './LiquidGlassButton';

/** Native dialog: the browser handles the focus trap, Escape and the inert background. */
export function LiquidGlassModal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const { t } = useI18n();
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current!;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className="lg-float lg-edge lg-modal" aria-labelledby={id} closedby="any" onClose={onClose}>
      <header className="mb-4 flex items-center justify-between gap-4">
        <h2 id={id} className="text-xl font-bold">
          {title}
        </h2>
        <LiquidGlassButton variant="icon" size="sm" aria-label={t('Close')} icon={<X aria-hidden />} onClick={onClose} />
      </header>
      {open && children}
    </dialog>
  );
}
