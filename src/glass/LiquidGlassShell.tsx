import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

/** Ambient light behind everything. Drifts only where nothing has to be re-blurred in front of it. */
export const Aurora = ({ live }: { live?: boolean }) => (
  <div className="aurora" data-live={live || undefined} aria-hidden>
    <i />
    <i />
    <i />
    <i />
  </div>
);

/** The floating slab of glass the whole workspace sits on. */
export function LiquidGlassShell({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('lg-shell lg-edge', className)}>
      <span className="lg-shell-flares" aria-hidden />
      {children}
    </div>
  );
}
