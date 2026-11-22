import { Award, BotMessageSquare, ChartNoAxesColumn, ClipboardCheck, Folder, House, Settings, Sparkles, UserRound } from 'lucide-react';

/** The first four, with `short` labels, are the phone's bottom bar. */
export const NAV = [
  { to: '/dashboard', label: 'Dashboard', short: 'Home', icon: House },
  { to: '/skills', label: 'Skill Profiling', short: 'Skills', icon: ChartNoAxesColumn },
  { to: '/learn', label: 'AI Learning Path', short: 'Learn', icon: Sparkles },
  { to: '/labs', label: 'Project Labs', short: 'Labs', icon: Folder },
  { to: '/assessments', label: 'Assessments', short: '', icon: ClipboardCheck },
  { to: '/certificates', label: 'Certificates', short: '', icon: Award },
  { to: '/portfolio', label: 'Portfolio', short: '', icon: UserRound },
  { to: '/assistant', label: 'AI Assistant', short: '', icon: BotMessageSquare },
  { to: '/settings', label: 'Settings', short: '', icon: Settings },
] as const;

export const isActive = (pathname: string, to: string) => pathname === to || pathname.startsWith(`${to}/`);
