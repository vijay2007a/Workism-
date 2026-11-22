import { Bell, ChevronDown, LogIn, LogOut, Search, Settings, Sparkles, UserRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { GlassMenu } from '../glass/GlassMenu';
import { GlassTooltip } from '../glass/GlassTooltip';
import { LiquidGlassButton } from '../glass/LiquidGlassButton';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { setState, useStore } from '../lib/store';
import { useWorkspace } from '../lib/workspace';
import { api } from '../services';
import { LanguageSelector } from './LanguageSelector';
import { Logo, LogoMark } from './Logo';
import { SearchBox } from './SearchBox';

export function Avatar({ name, className = 'size-12 text-lg' }: { name: string; className?: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
  return (
    <span className={`lg-avatar ${className}`} aria-hidden>
      {initials || <UserRound className="size-[55%]" strokeWidth={1.6} />}
    </span>
  );
}

function Notifications() {
  const { t, date } = useI18n();
  const { authenticated } = useAuth();
  const { notifications: remoteNotices, retry } = useWorkspace();
  const localNotices = useStore((s) => s.notices);
  const notices = authenticated ? remoteNotices : localNotices;
  const unread = notices.filter((n) => !n.read).length;
  const markRead = () => {
    if (authenticated) {
      void api.markNotificationsRead().then(() => retry(), () => {});
      return;
    }
    setState((s) => ({ notices: s.notices.map((n) => ({ ...n, read: true })) }));
  };
  return (
    <GlassMenu
      label={t('Notifications')}
      trigger={(p) => (
        <span className="relative inline-flex">
          <LiquidGlassButton
            variant="icon"
            {...p}
            aria-label={unread ? t('Notifications, {n} unread', { n: unread }) : t('Notifications')}
            icon={<Bell aria-hidden />}
          />
          {unread > 0 && <span className="lg-dot" aria-hidden />}
        </span>
      )}
    >
      {(close) => (
        <>
          <div className="flex items-center justify-between gap-3 px-3 pt-1 pb-2">
            <p className="font-bold">{t('Notifications')}</p>
            {unread > 0 && (
              <button type="button" className="text-sm font-medium text-violet-deep underline-offset-4 hover:underline" onClick={markRead}>
                {t('Mark all read')}
              </button>
            )}
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {notices.map((n) => (
              <li key={n.id}>
                <Link to={n.to} onClick={close} className="flex gap-3 rounded-2xl px-3 py-2.5 hover:bg-white/60">
                  <span className={`mt-1.5 size-2.5 flex-none rounded-full ${n.read ? 'bg-ink-3/40' : 'bg-violet'}`} />
                  <span className="min-w-0 text-[0.9375rem]">
                    {t(n.text)}
                    {n.at > 0 && <span className="block text-sm text-ink-soft">{date(n.at, { dateStyle: 'medium', timeStyle: 'short' })}</span>}
                  </span>
                </Link>
              </li>
            ))}
            {notices.length === 0 && <li className="px-3 py-4 text-ink-soft">{t('Nothing new.')}</li>}
          </ul>
        </>
      )}
    </GlassMenu>
  );
}

function ProfileMenu() {
  const { t } = useI18n();
  const go = useNavigate();
  const { name, role } = useWorkspace();
  const { authenticated, email, signOut } = useAuth();
  const links = [
    { to: '/portfolio', label: 'Portfolio', icon: UserRound },
    { to: '/settings', label: 'Settings', icon: Settings },
    ...(!authenticated ? [{ to: '/login', label: 'Log in', icon: LogIn }] : []),
  ];
  return (
    <GlassMenu
      label={t('Profile')}
      className="tab:w-64"
      trigger={(p) => (
        <button type="button" {...p} aria-label={t('Profile menu')} className="lg-profile">
          <Avatar name={name} />
          <ChevronDown className="size-5 max-tab:hidden" strokeWidth={1.6} aria-hidden />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="flex items-center gap-3 px-3 pt-1 pb-3">
            <Avatar name={name} className="size-11" />
            <div className="min-w-0">
              <p className="truncate font-bold">{name || t('Student')}</p>
              <p className="truncate text-sm text-ink-soft">{authenticated ? `${email || role}` : t('On this device')}</p>
            </div>
          </div>
          <ul>
            {links.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <Link to={to} onClick={close} className="flex items-center gap-3 rounded-2xl px-3 py-2.5 font-medium hover:bg-white/60">
                  <Icon className="size-5" strokeWidth={1.6} aria-hidden />
                  {t(label)}
                </Link>
              </li>
            ))}
            {authenticated && (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    close();
                    void signOut().then(() => go('/login'));
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 font-medium hover:bg-white/60"
                >
                  <LogOut className="size-5" strokeWidth={1.6} aria-hidden />
                  Sign out
                </button>
              </li>
            )}
          </ul>
        </>
      )}
    </GlassMenu>
  );
}

export function LiquidGlassNavbar({ onAssistant }: { onAssistant: () => void }) {
  const { t } = useI18n();
  return (
    <header className="lg-navbar">
      <Link to="/dashboard" aria-label={t('WORKISM home')} className="flex items-center rounded-full">
        <LogoMark className="h-8 w-auto tab:hidden" />
        <Logo className="max-tab:hidden text-[1.6rem]" />
      </Link>
      <p className="border-s border-ink/20 ps-5 text-[0.9375rem] leading-tight text-ink-soft max-desk:hidden">{t('AI-Adaptive Skill & Project Learning')}</p>
      <div className="ms-auto flex items-center gap-2.5 tab:gap-3">
        <div className="w-72 max-desk:w-52 max-tab:hidden">
          <SearchBox />
        </div>
        <div className="tab:hidden">
          <GlassMenu label={t('Search')} trigger={(p) => <LiquidGlassButton variant="icon" {...p} aria-label={t('Search')} icon={<Search aria-hidden />} />}>
            {(close) => <SearchBox focusOnMount onDone={close} />}
          </GlassMenu>
        </div>
        <LanguageSelector />
        <span className="max-tab:hidden">
          <GlassTooltip text={t('AI Assistant')} side="bottom">
            <LiquidGlassButton variant="icon" aria-label={t('Open AI Assistant')} icon={<Sparkles className="text-violet" aria-hidden />} onClick={onAssistant} />
          </GlassTooltip>
        </span>
        <Notifications />
        <ProfileMenu />
      </div>
    </header>
  );
}
