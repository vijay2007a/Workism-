import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { motion } from 'motion/react';
import { Outlet, useLocation, useNavigate, useOutletContext } from 'react-router';
import { LiquidGlassButton } from '../glass/LiquidGlassButton';
import { LiquidGlassPanel } from '../glass/LiquidGlassPanel';
import { Aurora, LiquidGlassShell } from '../glass/LiquidGlassShell';
import { LoadingSkeleton } from '../glass/LoadingSkeleton';
import { useMedia } from '../lib/effects';
import { useI18n } from '../lib/i18n';
import { useStore } from '../lib/store';
import { useWorkspace } from '../lib/workspace';
import { FloatingAssistant } from './AIAssistantPanel';
import { LiquidGlassNavbar } from './LiquidGlassNavbar';
import { LiquidGlassSidebar } from './LiquidGlassSidebar';
import { MobileNav } from './MobileNav';

interface Frame { openAssistant: () => void }
export const useFrame = () => useOutletContext<Frame>();

export function AppLayout() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const go = useNavigate();
  const mini = useStore((s) => s.settings.sidebar) === 'mini';
  const wide = useMedia('(min-width: 46rem)');
  const { status, retry } = useWorkspace();
  const [assistant, setAssistant] = useState(false);
  const closeAssistant = useCallback(() => setAssistant(false), []);
  const onAssistantPage = pathname === '/assistant';
  const openAssistant = () => (wide && !onAssistantPage ? setAssistant(true) : go('/assistant'));

  // After a move, keyboard and screen-reader users continue from the new page instead of the old link.
  const last = useRef(pathname);
  useEffect(() => {
    if (last.current !== pathname) document.getElementById('main')?.focus({ preventScroll: true });
    last.current = pathname;
  }, [pathname]);

  return (
    <div className="app">
      <a href="#main" className="lg-skip">
        {t('Skip to content')}
      </a>
      <Aurora />
      <LiquidGlassShell className="app-shell">
        <LiquidGlassNavbar onAssistant={() => (assistant ? closeAssistant() : openAssistant())} />
        <div className="app-grid" data-mini={mini || undefined} data-dash={pathname === '/dashboard' || undefined}>
          {wide && <LiquidGlassSidebar />}
          <motion.main
            key={pathname.split('/')[1]}
            id="main"
            tabIndex={-1}
            className="app-main"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 160, damping: 22 }}
          >
            {status === 'loading' && <LoadingSkeleton />}
            {status === 'error' && (
              <LiquidGlassPanel title={t('Your records did not load')}>
                <p className="mb-5 text-ink-soft">{t('The WORKISM API did not answer. Nothing has been lost.')}</p>
                <LiquidGlassButton variant="primary" icon={<RotateCcw aria-hidden />} onClick={retry}>
                  {t('Try again')}
                </LiquidGlassButton>
              </LiquidGlassPanel>
            )}
            {status === 'ready' && (
              <Suspense fallback={<LoadingSkeleton />}>
                <Outlet context={{ openAssistant } satisfies Frame} />
              </Suspense>
            )}
          </motion.main>
        </div>
      </LiquidGlassShell>
      {!wide && <MobileNav />}
      <FloatingAssistant open={assistant && wide && !onAssistantPage} onClose={closeAssistant} />
    </div>
  );
}
