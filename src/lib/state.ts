import type { QuizResult } from './progress.ts';

export interface Notice { id: string; text: string; to: string; at: number; read: boolean }
export interface Submission { repo: string; note: string; at: number }

const fresh = () => ({
  profile: { name: '', email: '', goal: '', interests: [] as string[], style: '', pace: '', github: '', codeLang: '' },
  settings: {
    lang: '',
    motion: 'auto' as string,
    effects: 'auto' as string,
    clarity: 50,
    sidebar: 'open' as string,
    notices: true,
    showScores: true,
  },
  lessons: [] as string[],
  quiz: {} as Record<string, QuizResult>,
  code: {} as Record<string, { passed: number; total: number; at: number }>,
  submissions: {} as Record<string, Submission>,
  notices: [{ id: 'welcome', text: 'Welcome to WORKISM. Scores shown here are sample data until the API is connected.', to: '/skills', at: 0, read: false }] as Notice[],
});

export type AppState = ReturnType<typeof fresh>;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Keep saved values whose type still matches the current shape; anything else falls back to its default. */
function merge<T>(base: T, saved: unknown): T {
  if (isObject(base)) {
    if (!isObject(saved)) return base;
    if (Object.keys(base).length === 0) return saved as T; // open-ended record
    return Object.fromEntries(Object.entries(base).map(([k, v]) => [k, merge(v, saved[k])])) as T;
  }
  if (Array.isArray(base)) return (Array.isArray(saved) ? saved : base) as T;
  return typeof saved === typeof base ? (saved as T) : base;
}

export function parseState(raw: string | null): AppState {
  try {
    return merge(fresh(), JSON.parse(raw ?? 'null'));
  } catch {
    return fresh();
  }
}
