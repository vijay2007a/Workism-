import type { CSSProperties, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { motion, type HTMLMotionProps } from 'motion/react';
import { cn } from '../lib/cn';
import { LiquidGlassButton } from './LiquidGlassButton';

interface Props extends Omit<HTMLMotionProps<'section'>, 'title' | 'children'> {
  title?: ReactNode;
  /** Sits opposite the title. */
  action?: ReactNode;
  /** Colour of the light inside the far corner of the pane. */
  tint?: string;
  caustic?: boolean;
  children?: ReactNode;
}

export function LiquidGlassPanel({ title, action, tint, caustic, className, style, children, ...rest }: Props) {
  return (
    <motion.section
      className={cn('lg-panel lg-edge lg-light p-5 tab:p-6', className)}
      style={{ ...style, ...(tint ? ({ '--tint': tint } as CSSProperties) : null) }}
      initial={{ opacity: 0, y: 22, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 150, damping: 20 }}
      {...rest}
    >
      {caustic && <span className="lg-caustic" aria-hidden />}
      {(title || action) && (
        <header className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[1.4rem] leading-tight font-bold tracking-[-0.012em]">{title}</h2>
          {action}
        </header>
      )}
      {children}
    </motion.section>
  );
}

/** The round chevron in the corner of a card. */
export const PanelLink = ({ to, label }: { to: string; label: string }) => (
  <LiquidGlassButton variant="icon" size="sm" to={to} aria-label={label} icon={<ChevronRight className="rtl:-scale-x-100" aria-hidden />} />
);
