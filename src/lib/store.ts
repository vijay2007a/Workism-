import { useSyncExternalStore } from 'react';
import { parseState, type AppState, type Notice } from './state';

const KEY = 'workism:v1';
const read = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null; // storage blocked: the app still works, it just forgets
  }
};

let state = parseState(read());
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const emit = () => listeners.forEach((fn) => fn());

export const getState = () => state;

export function setState(patch: (s: AppState) => Partial<AppState>) {
  state = { ...state, ...patch(state) };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch { /* storage blocked or full: keep the in-memory state */ }
  emit();
}

export const setSettings = (patch: Partial<AppState['settings']>) => setState((s) => ({ settings: { ...s.settings, ...patch } }));
export const setProfile = (patch: Partial<AppState['profile']>) => setState((s) => ({ profile: { ...s.profile, ...patch } }));

export function notify(notice: Pick<Notice, 'id' | 'text' | 'to'>) {
  if (state.settings.notices) setState((s) => ({ notices: [{ ...notice, at: Date.now(), read: false }, ...s.notices.filter((n) => n.id !== notice.id)].slice(0, 20) }));
}

/** Kept on this device until the evaluation service can receive it. */
export const saveSubmission = (id: string, repo: string, note: string) =>
  setState((s) => ({ submissions: { ...s.submissions, [id]: { repo, note, at: Date.now() } } }));

export function resetState() {
  setState(() => parseState(null));
}

/** Selectors must return a stored reference or a primitive. */
export const useStore = <T,>(pick: (s: AppState) => T) => useSyncExternalStore(subscribe, () => pick(state));

window.addEventListener('storage', (e) => {
  if (e.key !== KEY) return;
  state = parseState(e.newValue);
  emit();
});
