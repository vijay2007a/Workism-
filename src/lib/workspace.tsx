import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, connected, type Workspace } from '../services';
import { withResults } from './progress';
import { useStore } from './store';

interface Value extends Workspace {
  status: 'loading' | 'ready' | 'error';
  /** True while records come from src/data/sample.ts. */
  sample: boolean;
  retry: () => void;
}

const empty: Workspace = { name: '', skills: [], courses: [], projects: [], certificates: [], lessonsDone: [] };
const Ctx = createContext<Value>({ ...empty, status: 'loading', sample: true, retry: () => {} });
export const useWorkspace = () => use(Ctx);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState(empty);
  const [status, setStatus] = useState<Value['status']>('loading');
  const [attempt, setAttempt] = useState(0);
  const quiz = useStore((s) => s.quiz);
  const lessons = useStore((s) => s.lessons);
  const ownName = useStore((s) => s.profile.name);

  useEffect(() => {
    let live = true;
    api.workspace().then(
      (w) => {
        if (!live) return;
        setData(w);
        setStatus('ready');
      },
      () => live && setStatus('error'),
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setStatus('loading');
    setAttempt((n) => n + 1);
  }, []);

  const value = useMemo<Value>(
    () => ({
      ...data,
      name: data.name || ownName,
      skills: withResults(data.skills, quiz),
      lessonsDone: [...new Set([...data.lessonsDone, ...lessons])],
      status,
      sample: !connected,
      retry,
    }),
    [data, ownName, quiz, lessons, status, retry],
  );
  return <Ctx value={value}>{children}</Ctx>;
}

// Categorical slots, checked for colour-vision separation and 3:1 contrast on the panes. Order is fixed per learner.
const PALETTE = ['#8246f0', '#0d9488', '#3b6cf0', '#db4f9c', '#c2700f'];
export const skillColor = (skills: readonly { id: string }[], id: string) => PALETTE[skills.findIndex((s) => s.id === id)] ?? '#6b6f86';
