import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';

interface Props { title: string; subtitle?: ReactNode; back?: { to: string; label: string }; children?: ReactNode }

export function PageHeader({ title, subtitle, back, children }: Props) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 px-1 pt-1">
      <title>{`${title} · WORKISM`}</title>
      <div className="min-w-0 max-w-2xl">
        {back && (
          <Link to={back.to} className="mb-2 inline-flex min-h-8 items-center gap-2 rounded-full text-[0.9375rem] font-medium text-violet-deep hover:underline">
            <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden />
            {back.label}
          </Link>
        )}
        <h1 className="text-[clamp(1.75rem,3.4vw,2.3rem)] leading-[1.15] font-bold tracking-[-0.02em] text-balance">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[1.0625rem] text-ink-soft">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
    </header>
  );
}
