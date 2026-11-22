import type { ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { motion, type HTMLMotionProps } from 'motion/react';
import { Link } from 'react-router';
import { cn } from '../lib/cn';

const MotionLink = motion.create(Link);
const release = { type: 'spring', stiffness: 520, damping: 14, mass: 0.75 } as const;

interface Props extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: 'primary' | 'secondary' | 'icon' | 'float' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  tone?: 'aqua';
  icon?: ReactNode;
  loading?: boolean;
  /** Renders a router link with the same material. */
  to?: string;
  children?: ReactNode;
}

/** A drop of liquid glass: lifts on hover, squashes when pressed, springs back. */
export function LiquidGlassButton({ variant = 'secondary', size = 'md', tone, icon, loading, to, children, className, disabled, type = 'button', ...rest }: Props) {
  const off = disabled || loading;
  const shared = {
    className: cn('lg-btn lg-light', className),
    'data-variant': variant,
    'data-size': size,
    'data-tone': tone,
    whileHover: off ? undefined : { y: -2.5 },
    whileTap: off ? undefined : { y: 0.5, scaleX: 1.025, scaleY: 0.92 },
    transition: release,
  };
  const body = (
    <>
      {loading ? <LoaderCircle className="animate-spin" aria-hidden /> : icon}
      {children}
    </>
  );
  if (to && !off) {
    const { onClick, 'aria-label': label } = rest;
    return (
      <MotionLink {...shared} to={to} aria-label={label} onClick={onClick as never}>
        {body}
      </MotionLink>
    );
  }
  return (
    <motion.button {...shared} type={type} disabled={off} aria-busy={loading || undefined} {...rest}>
      {body}
    </motion.button>
  );
}
