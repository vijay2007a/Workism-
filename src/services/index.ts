// The only place the app talks to a backend. Without VITE_API_URL every read returns labelled sample data
// and every write throws NotConnected, which screens show as "not connected" rather than faking success.
// The paths below are assumptions: point them at the real WORKISM endpoints.
import type { SkillSource } from '../lib/progress';
import * as sample from '../data/sample';

export interface Skill { id: string; name: string; score: number; target: number; history: number[]; source: SkillSource }
export interface Question { q: string; options: string[]; answer: number; why: string }
export interface Lesson { id: string; title: string; minutes: number; body: string[]; code?: string; check: Question }
export interface Course { id: string; skill: string; title: string; blurb: string; level: string; modules: { title: string; lessons: Lesson[] }[] }
export interface Project { id: string; title: string; skills: string[]; level: string; hours: number; brief: string; requirements: string[]; rubric: string[]; status?: 'submitted' | 'evaluating' | 'evaluated' | 'verified'; score?: number; feedback?: string }
export interface Certificate { id: string; title: string; skill: string; course: string; project: string; status: 'verified' | 'pending' | 'revoked'; source: 'sample' | 'api'; issuedAt?: number }
export interface Workspace { name: string; skills: Skill[]; courses: Course[]; projects: Project[]; certificates: Certificate[]; lessonsDone: string[] }
export interface ChatMessage { role: 'user' | 'assistant'; text: string }

const API: string = import.meta.env.VITE_API_URL ?? '';
export const connected = API !== '';

export class NotConnected extends Error {}

async function call<T>(path: string, body?: unknown): Promise<T> {
  if (!connected) throw new NotConnected(path);
  const res = await fetch(API + path, {
    method: body ? 'POST' : 'GET',
    credentials: 'include',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${path} responded ${res.status}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Provenance is stamped here, never taken from the payload. */
const fromApi = (w: Workspace): Workspace => ({
  ...w,
  skills: w.skills.map((s) => ({ ...s, source: 'api' })),
  certificates: w.certificates.map((c) => ({ ...c, source: 'api' })),
});

export const api = {
  workspace: (): Promise<Workspace> => (connected ? call<Workspace>('/me/workspace').then(fromApi) : Promise.resolve(sample.workspace)),
  login: (email: string, password: string) => call<void>('/auth/login', { email, password }),
  register: (name: string, email: string, password: string) => call<void>('/auth/register', { name, email, password }),
  submitProject: (id: string, repo: string, note: string) => call<void>(`/projects/${encodeURIComponent(id)}/submissions`, { repo, note }),
  verifyCertificate: (id: string) => call<Certificate>(`/certificates/${encodeURIComponent(id)}`).then((c): Certificate => ({ ...c, source: 'api' })),
  ask: (messages: ChatMessage[]) => call<{ text: string }>('/assistant/messages', { messages }),
};

/** What each screen still needs from the backend. Listed in Settings → Integrations. */
export const INTEGRATIONS = [
  { name: 'Learner records', needs: 'GET /me/workspace', used: 'Dashboard, skills, courses, projects, certificates' },
  { name: 'Sign-in', needs: 'POST /auth/login, POST /auth/register', used: 'Log in, Register' },
  { name: 'Project evaluation', needs: 'POST /projects/:id/submissions', used: 'Project Labs' },
  { name: 'Certificate verification', needs: 'GET /certificates/:id', used: 'Certificates, public verify page' },
  { name: 'AI assistant', needs: 'POST /assistant/messages', used: 'AI Assistant' },
] as const;

export interface Repo { name: string; description: string | null; html_url: string; language: string | null; stargazers_count: number; fork: boolean }

/** Public data only, fetched when the learner asks for it. Private repositories need the WORKISM GitHub OAuth app. */
export async function publicRepos(user: string): Promise<Repo[]> {
  const res = await fetch(`https://api.github.com/users/${encodeURIComponent(user)}/repos?sort=updated&per_page=12`);
  if (res.status === 404) throw new Error('No GitHub user has that name.');
  if (res.status === 403 || res.status === 429) throw new Error('GitHub is rate-limiting this network. Try again in an hour.');
  if (!res.ok) throw new Error('GitHub did not answer. Try again.');
  return ((await res.json()) as Repo[]).filter((r) => !r.fork).slice(0, 6);
}
