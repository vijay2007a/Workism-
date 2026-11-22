import { ChevronsLeft, ChevronsRight, GraduationCap, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { Link, useLocation } from 'react-router';
import { useI18n } from '../lib/i18n';
import { setSettings, useStore } from '../lib/store';
import { useWorkspace } from '../lib/workspace';
import { isActive, NAV } from './nav';

/** `id` keeps the sliding pill of the sidebar apart from the one in the mobile drawer. */
export function NavLinks({ id, items = NAV, onNavigate }: { id: string; items?: readonly (typeof NAV)[number][]; onNavigate?: () => void }) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  return items.map(({ to, label, icon: Icon }) => {
    const on = isActive(pathname, to);
    return (
      <li key={to}>
        <Link to={to} className="lg-nav-item" aria-current={on ? 'page' : undefined} title={t(label)} onClick={onNavigate}>
          {on && <motion.span layoutId={`${id}-pill`} className="lg-nav-pill" transition={{ type: 'spring', stiffness: 340, damping: 26 }} />}
          <Icon aria-hidden />
          <span className="lg-nav-label">{t(label)}</span>
        </Link>
      </li>
    );
  });
}

export function LiquidGlassSidebar() {
  const { t } = useI18n();
  const { role } = useWorkspace();
  const { pathname } = useLocation();
  const mini = useStore((s) => s.settings.sidebar) === 'mini';
  const Toggle = mini ? ChevronsRight : ChevronsLeft;
  return (
    <motion.nav
      aria-label={t('Main')}
      className="lg-panel lg-edge lg-sidebar"
      initial={{ opacity: 0, x: -18 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: 'spring', stiffness: 150, damping: 20 }}
    >
      <ul className="flex flex-1 flex-col gap-1.5">
        <NavLinks id="side" items={NAV.slice(0, -1)} />
        {(role === 'instructor' || role === 'admin') && (
          <li>
            <Link to="/instructor" className="lg-nav-item" aria-current={isActive(pathname, '/instructor') ? 'page' : undefined} title="Instructor">
              <GraduationCap aria-hidden />
              <span className="lg-nav-label">Instructor</span>
            </Link>
          </li>
        )}
        {role === 'admin' && (
          <li>
            <Link to="/admin" className="lg-nav-item" aria-current={isActive(pathname, '/admin') ? 'page' : undefined} title="Admin">
              <ShieldCheck aria-hidden />
              <span className="lg-nav-label">Admin</span>
            </Link>
          </li>
        )}
        <li className="mt-auto" aria-hidden>
          <hr className="mx-4 mb-1 border-white/60" />
        </li>
        <NavLinks id="side" items={NAV.slice(-1)} />
      </ul>
      <button
        type="button"
        className="lg-side-toggle"
        aria-label={mini ? t('Expand sidebar') : t('Collapse sidebar')}
        aria-expanded={!mini}
        onClick={() => setSettings({ sidebar: mini ? 'open' : 'mini' })}
      >
        <Toggle className="size-4 rtl:-scale-x-100" aria-hidden />
      </button>
    </motion.nav>
  );
}
