import { useRef, useState } from 'react';
import { Menu } from 'lucide-react';
import { motion } from 'motion/react';
import { Link, useLocation } from 'react-router';
import { LiquidGlassModal } from '../glass/LiquidGlassModal';
import { useRefraction } from '../glass/refraction';
import { useI18n } from '../lib/i18n';
import { NavLinks } from './LiquidGlassSidebar';
import { isActive, NAV } from './nav';

/** Phone navigation: four destinations in reach of a thumb, everything else in the drawer. */
export function MobileNav() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const bar = useRef<HTMLElement>(null);
  const refraction = useRefraction(bar);
  const main = NAV.slice(0, 4);
  return (
    <>
      <nav ref={bar} aria-label={t('Main')} className="lg-float lg-edge lg-mobile-nav">
        {refraction}
        {main.map(({ to, short, icon: Icon }) => {
          const on = isActive(pathname, to);
          return (
            <Link key={to} to={to} className="lg-mobile-item" aria-current={on ? 'page' : undefined}>
              {on && <motion.span layoutId="mobile-pill" className="lg-nav-pill" transition={{ type: 'spring', stiffness: 380, damping: 28 }} />}
              <Icon aria-hidden />
              <span>{t(short)}</span>
            </Link>
          );
        })}
        <button type="button" className="lg-mobile-item" aria-haspopup="dialog" onClick={() => setOpen(true)}>
          <Menu aria-hidden />
          <span>{t('Menu')}</span>
        </button>
      </nav>
      <LiquidGlassModal open={open} onClose={() => setOpen(false)} title={t('Menu')}>
        <ul className="grid gap-1">
          <NavLinks id="drawer" onNavigate={() => setOpen(false)} />
        </ul>
      </LiquidGlassModal>
    </>
  );
}
