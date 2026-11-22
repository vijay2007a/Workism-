import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '../lib/cn';
import { useRefraction } from './refraction';

interface Props {
  label: string;
  /** Draws the trigger; spread the props onto a button. */
  trigger: (props: { onClick: () => void; 'aria-expanded': boolean; 'aria-haspopup': 'dialog' }) => ReactNode;
  children: (close: () => void) => ReactNode;
  className?: string;
}

/** Glass popover. Closes on Escape, outside press, or when focus moves away. */
export function GlassMenu({ label, trigger, children, className }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);

  useEffect(() => {
    const el = root.current;
    if (!open || !el) return;
    const away = (e: Event) => {
      if (!el.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('focusin', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('focusin', away);
      document.removeEventListener('keydown', esc);
      // Closing hands focus back to the trigger, also when the focused control removed itself.
      if (document.activeElement === document.body || el.contains(document.activeElement)) el.querySelector<HTMLElement>('[aria-haspopup]')?.focus();
    };
  }, [open]);

  return (
    <div ref={root} className="tab:relative">
      {trigger({ onClick: () => setOpen(!open), 'aria-expanded': open, 'aria-haspopup': 'dialog' })}
      <AnimatePresence>
        {open && (
          <Sheet label={label} className={className}>
            {children(close)}
          </Sheet>
        )}
      </AnimatePresence>
    </div>
  );
}

function Sheet({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const refraction = useRefraction(ref);
  return (
    <motion.div
      ref={ref}
      role="dialog"
      aria-label={label}
      className={cn('lg-float lg-edge absolute inset-x-3 top-full z-50 mt-3 p-3 tab:inset-x-auto tab:end-0 tab:w-80', className)}
      style={{ transformOrigin: 'top' }}
      initial={{ opacity: 0, y: -10, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96, transition: { duration: 0.14 } }}
      transition={{ type: 'spring', stiffness: 420, damping: 24 }}
    >
      {refraction}
      {children}
    </motion.div>
  );
}
