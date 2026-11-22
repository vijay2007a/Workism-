import { useId } from 'react';

export function LogoMark({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 48 34" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}a`} x1="3" y1="4" x2="26" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#d9b8ff" />
          <stop offset=".5" stopColor="#9a5cf6" />
          <stop offset="1" stopColor="#5b3fe0" />
        </linearGradient>
        <linearGradient id={`${id}b`} x1="20" y1="10" x2="45" y2="6" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4a55ea" />
          <stop offset=".55" stopColor="#3b7df6" />
          <stop offset="1" stopColor="#4cc2fb" />
        </linearGradient>
      </defs>
      <path d="M6.5 9 14 26.5 23 11.5" fill="none" stroke={`url(#${id}a)`} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M23 11.5 31 26.5 41.5 6.5" fill="none" stroke={`url(#${id}b)`} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" opacity=".95" />
      <path d="M5.2 8.4 12.2 24" fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M30 22.5 39.4 5.4" fill="none" stroke="#fff" strokeOpacity=".45" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className = 'text-[1.6rem]' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-extrabold tracking-[0.005em] text-[#20213a] ${className}`}>
      <LogoMark className="h-[1.28em] w-auto flex-none" />
      WORKISM
    </span>
  );
}
