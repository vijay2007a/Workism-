import { motion } from 'motion/react';
import { cn } from '../lib/cn';
import { useI18n } from '../lib/i18n';

/** Liquid filling a glass tube. */
export function LiquidProgressBar({ value, label, className }: { value: number; label: string; className?: string }) {
  const { percent } = useI18n();
  const v = Math.min(100, Math.max(0, value));
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-valuetext={percent(v)} className={cn('lg-tube', className)}>
      <motion.div className="lg-tube-fill" initial={{ width: '0%' }} animate={{ width: `${v}%` }} transition={{ type: 'spring', stiffness: 55, damping: 11, delay: 0.15 }}>
        {v > 4 && <span className="lg-tube-lip" />}
      </motion.div>
    </div>
  );
}

/** Score ring beside a skill. Decorative: the number is always printed next to it. */
export function ScoreRing({ value, color, className }: { value: number; color: string; className?: string }) {
  const r = 13;
  const length = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 34 34" className={cn('size-9 flex-none -rotate-90', className)} aria-hidden>
      <circle cx="17" cy="17" r={r} fill="none" stroke={color} strokeOpacity=".2" strokeWidth="5" />
      <motion.circle
        cx="17"
        cy="17"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={length}
        initial={{ strokeDashoffset: length }}
        animate={{ strokeDashoffset: length * (1 - value / 100) }}
        transition={{ type: 'spring', stiffness: 45, damping: 12, delay: 0.2 }}
      />
      <circle cx="17" cy="17" r={r - 1.6} fill="none" stroke="#fff" strokeOpacity=".45" strokeWidth=".9" />
    </svg>
  );
}
