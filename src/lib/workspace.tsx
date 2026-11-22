import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, connected, type RemoteProfile, type Roadmap, type UserRole, type Workspace } from '../services';
import { useAuth } from './auth';
import { withResults } from './progress';
import { setProfile, setSettings, useStore } from './store';

interface Value extends Workspace {
  status: 'loading' | 'ready' | 'error';
  /** True while records come from src/data/sample.ts. */
  sample: boolean;
  role: UserRole;
  profile: RemoteProfile | null;
  roadmap: Roadmap | null;
  retry: () => void;
}

const empty: Workspace = { name: '', skills: [], courses: [], projects: [], certificates: [], lessonsDone: [] };
const Ctx = createContext<Value>({
  ...empty,
  status: 'loading',
  sample: true,
  role: 'student',
  profile: null,
  roadmap: null,
  retry: () => {},
});
export const useWorkspace = () => use(Ctx);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { ready: authReady, authenticated } = useAuth();
  const [data, setData] = useState(empty);
  const [status, setStatus] = useState<Value['status']>('loading');
  const [attempt, setAttempt] = useState(0);
  const quiz = useStore((s) => s.quiz);
  const lessons = useStore((s) => s.lessons);
  const ownName = useStore((s) => s.profile.name);

  useEffect(() => {
    if (!authReady) return;
    let live = true;
    api.workspace().then(
      (w) => {
        if (!live) return;
        setData(w);
        if (w.profile) {
          setProfile({
            name: w.profile.displayName || ownName,
            email: w.profile.email,
            goal: w.profile.careerGoal,
            interests: w.profile.interests,
            style: w.profile.learningStyle,
            pace: w.profile.learningPace,
            github: w.profile.githubUsername,
            codeLang: w.profile.preferredCodeLanguage,
          });
          if (w.profile.preferredLanguage) setSettings({ lang: w.profile.preferredLanguage });
        }
        setStatus('ready');
      },
      () => live && setStatus('error'),
    );
    return () => {
      live = false;
    };
    // oxlint-disable-next-line react/exhaustive-deps
  }, [attempt, authReady, authenticated]);

  const retry = useCallback(() => {
    setStatus((current) => current === 'ready' ? 'ready' : 'loading');
    setAttempt((n) => n + 1);
  }, []);

  const isLive = connected && authenticated;
  const value = useMemo<Value>(
    () => ({
      ...data,
      name: data.name || ownName,
      role: data.role ?? 'student',
      profile: data.profile ?? null,
      roadmap: data.roadmap ?? null,
      skills: isLive ? data.skills : withResults(data.skills, quiz),
      lessonsDone: isLive ? data.lessonsDone : [...new Set([...data.lessonsDone, ...lessons])],
      status,
      sample: !isLive,
      retry,
    }),
    [data, ownName, quiz, lessons, status, isLive, retry],
  );
  return <Ctx value={value}>{children}</Ctx>;
}

// Categorical slots, checked for colour-vision separation and 3:1 contrast on the panes. Order is fixed per learner.
const PALETTE = ['#8246f0', '#0d9488', '#3b6cf0', '#db4f9c', '#c2700f'];
export const skillColor = (skills: readonly { id: string }[], id: string) => PALETTE[skills.findIndex((s) => s.id === id)] ?? '#6b6f86';
