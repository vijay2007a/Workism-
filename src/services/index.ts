// Central API client for WORKISM 3.0.
// When neither VITE_API_URL nor VITE_SUPABASE_URL/PUBLISHABLE_KEY is configured, reads return labelled sample data
// and writes throw NotConnected so screens never fake production success.
import type { SkillSource } from '../lib/progress';
import * as sample from '../data/sample';
import { supabase, supabaseConfigured } from '../lib/supabase';

export type UserRole = 'student' | 'instructor' | 'admin';
export interface Skill { id: string; name: string; score: number; target: number; history: number[]; source: SkillSource }
export interface Question { q: string; options: string[]; answer: number; why: string }
export interface Lesson { id: string; title: string; minutes: number; body: string[]; code?: string; check: Question }
export interface Course { id: string; skill: string; title: string; blurb: string; level: string; modules: { title: string; lessons: Lesson[] }[] }
export interface Project {
  id: string;
  title: string;
  skills: string[];
  level: string;
  hours: number;
  brief: string;
  requirements: string[];
  rubric: string[];
  status?: 'submitted' | 'evaluating' | 'evaluated' | 'verified';
  score?: number;
  feedback?: string;
  submissionId?: string;
  repoUrl?: string;
  fileName?: string;
}
export interface Certificate {
  id: string;
  templateId?: string;
  title: string;
  skill: string;
  course: string;
  project: string;
  status: 'verified' | 'pending' | 'revoked';
  source: 'sample' | 'api';
  issuedAt?: number;
  holderName?: string;
  signatureVerified?: boolean;
  signatureAlg?: string;
}
export interface RoadmapItem { courseId: string | null; skillId: string | null; title: string; objective: string; lessonIds: string[] }
export interface Roadmap { id: string; goal: string; preferredLanguage: string; summary: string; milestones: RoadmapItem[]; createdAt: string }
export interface RemoteProfile {
  id: string;
  role: UserRole;
  displayName: string;
  email: string;
  careerGoal: string;
  interests: string[];
  learningStyle: string;
  learningPace: string;
  preferredLanguage: string;
  preferredCodeLanguage: string;
  githubUsername: string;
  portfolioSlug: string | null;
  portfolioPublic: boolean;
  showScoresPublic: boolean;
  inAppNotices: boolean;
}
export interface Workspace {
  name: string;
  role?: UserRole;
  profile?: RemoteProfile | null;
  roadmap?: Roadmap | null;
  skills: Skill[];
  courses: Course[];
  projects: Project[];
  certificates: Certificate[];
  lessonsDone: string[];
}
export interface ChatMessage { role: 'user' | 'assistant'; text: string }

export interface AssessmentAttemptStart {
  attempt: { id: string; assessmentId: string; skillId: string; expiresAt: string; passMark: number; timeLimitSeconds: number };
  questions: { id: string; prompt: string; options: string[]; difficulty: string }[];
}

export interface AssessmentSubmissionResult {
  attempt: { id: string; scorePercent: number; correctCount: number; totalCount: number; aiExplanation: string | null };
  passed: boolean;
  passMark: number;
  review: { questionId: string; prompt: string; chosenIndex: number | null; correctIndex: number; correct: boolean; explanation: string }[];
  skills: Skill[];
}

export interface PublicPortfolioData {
  displayName: string;
  careerGoal: string;
  githubUsername: string;
  showScores: boolean;
  skills: { id: string; name: string; score: number | null; source: string }[];
  projects: { id: string; title: string; brief: string; repoUrl: string | null }[];
  certificates: { verificationCode: string; title: string; skillName: string; issuedAt: string }[];
}

const API_BASE: string = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/$/, '');
export const connected = Boolean(API_BASE || supabaseConfigured);

let currentAccessToken: string | null = null;
export function setAccessToken(token: string | null) {
  currentAccessToken = token;
}
export function getAccessToken(): string | null {
  return currentAccessToken;
}

export class NotConnected extends Error {}
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function buildUrl(path: string): string {
  const normalized = path.startsWith('/api/') ? path : `/api${path.startsWith('/') ? path : `/${path}`}`;
  return API_BASE ? `${API_BASE}${normalized}` : normalized;
}

async function call<T>(path: string, opts: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; auth?: boolean } = {}): Promise<T> {
  if (!connected) throw new NotConnected(path);
  const method = opts.method ?? (opts.body !== undefined ? 'POST' : 'GET');
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.auth !== false && currentAccessToken) {
    headers.authorization = `Bearer ${currentAccessToken}`;
  }
  const res = await fetch(buildUrl(path), {
    method,
    credentials: 'include',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const errBody = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string }; message?: string } | null;
    throw new ApiRequestError(
      res.status,
      errBody?.error?.code ?? 'request_failed',
      errBody?.error?.message ?? errBody?.message ?? `${path} responded ${res.status}`,
    );
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Provenance is stamped here, never taken from an unverified payload. */
const fromApi = (w: Workspace): Workspace => ({
  ...w,
  skills: w.skills.map((s) => ({ ...s, source: 'api' })),
  certificates: w.certificates.map((c) => ({ ...c, source: 'api' })),
});

export const api = {
  workspace: async (): Promise<Workspace> => {
    if (!connected || !currentAccessToken) return sample.workspace;
    return call<Workspace>('/api/me/workspace').then(fromApi);
  },

  login: async (email: string, password: string) => {
    if (!connected) throw new NotConnected('/auth/login');
    if (supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.session) throw new ApiRequestError(401, 'invalid_credentials', error?.message || 'Invalid credentials.');
      setAccessToken(data.session.access_token);
      return;
    }
    const res = await call<{ accessToken: string }>('/api/auth/login', { body: { email, password }, auth: false });
    setAccessToken(res.accessToken);
  },

  register: async (name: string, email: string, password: string): Promise<{ emailConfirmed: boolean }> => {
    if (!connected) throw new NotConnected('/auth/register');
    if (supabase) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: name.slice(0, 60) },
          emailRedirectTo: `${location.origin}/auth/callback`,
        },
      });
      if (error || !data.user) throw new ApiRequestError(400, 'registration_failed', error?.message || 'Registration failed.');
      if (data.session) setAccessToken(data.session.access_token);
      return { emailConfirmed: Boolean(data.session) };
    }
    const res = await call<{ emailConfirmed: boolean; accessToken?: string }>('/api/auth/register', {
      body: { name, email, password, redirectTo: `${location.origin}/auth/callback` },
      auth: false,
    });
    if (res.accessToken) setAccessToken(res.accessToken);
    return { emailConfirmed: res.emailConfirmed };
  },

  googleOAuth: async (): Promise<void> => {
    if (!connected) throw new NotConnected('/auth/oauth/google');
    const redirectTo = `${location.origin}/auth/callback`;
    if (supabase) {
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
      if (error) throw new ApiRequestError(400, 'oauth_failed', error.message);
      return;
    }
    const res = await call<{ url: string }>('/api/auth/oauth/google', { body: { redirectTo }, auth: false });
    location.assign(res.url);
  },

  recoverPassword: async (email: string) => {
    if (!connected) throw new NotConnected('/auth/recover');
    const redirectTo = `${location.origin}/reset-password`;
    if (supabase) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw new ApiRequestError(400, 'recovery_failed', 'Could not request a password reset.');
      return;
    }
    await call('/api/auth/recover', { body: { email, redirectTo }, auth: false });
  },

  resetPassword: async (password: string) => {
    if (!connected) throw new NotConnected('/auth/reset');
    if (supabase) {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new ApiRequestError(400, 'reset_failed', error.message);
      return;
    }
    await call('/api/auth/reset', { body: { password } });
  },

  logout: async () => {
    if (supabase) {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw new ApiRequestError(503, 'logout_failed', 'Could not end the session.');
    }
    else if (connected && currentAccessToken) await call('/api/auth/logout', { method: 'POST' });
    setAccessToken(null);
  },

  updateProfile: (patch: Partial<Omit<RemoteProfile, 'id' | 'role' | 'email'>>) =>
    call<{ profile: RemoteProfile }>('/api/profile', { method: 'PATCH', body: patch }),

  startAssessment: (skillId: string, languageCode?: string) =>
    call<AssessmentAttemptStart>(`/api/assessments/${encodeURIComponent(skillId)}/attempts`, { body: { languageCode } }),

  submitAssessment: (attemptId: string, answers: (number | null)[], languageCode?: string) =>
    call<AssessmentSubmissionResult>(`/api/assessments/attempts/${encodeURIComponent(attemptId)}/submit`, {
      body: { answers, languageCode },
    }),

  enrollCourse: (id: string) => call(`/api/courses/${encodeURIComponent(id)}/enroll`, { method: 'POST' }),

  completeLesson: (courseId: string, lessonId: string, answerIndex: number) =>
    call<{ lessonsDone: string[]; courseFinished: boolean }>(`/api/lessons/${encodeURIComponent(lessonId)}/complete`, {
      body: { courseId, answerIndex },
    }),

  generateRoadmap: (goal?: string, languageCode?: string) =>
    call<{ roadmap: Roadmap; generatedBy: string }>('/api/ai/roadmap', { body: { goal, languageCode } }),

  ask: (messages: ChatMessage[], languageCode?: string) =>
    call<{ text: string }>('/api/ai/tutor', { body: { messages, languageCode } }),

  executeCode: (challengeId: string, languageId: string, code: string) =>
    call<{ status: string; simulated: false; passedCount?: number; totalCount?: number; publicResults?: { ok: boolean; got: string }[]; error?: string; message?: string }>('/api/code/execute', {
      body: { challengeId, languageId, code },
    }),

  recordCodeSubmission: (payload: { challengeId: string; languageId: string; code: string; executionMode: 'browser_js' | 'remote_sandbox' | 'unavailable'; passedCount: number; totalCount: number; results: { ok: boolean; got: string }[] }) =>
    call<{ id: string }>('/api/code/submissions', { body: payload }),

  uploadProjectFile: async (id: string, file: File) => {
    if (!supabase) throw new NotConnected('Supabase Storage');
    const mime = file.type || (/\.md$/i.test(file.name) ? 'text/markdown' : /\.txt$/i.test(file.name) ? 'text/plain' : 'application/octet-stream');
    const ticket = await call<{ signedUrl: string; path: string; safeName: string }>(
      `/api/projects/${encodeURIComponent(id)}/upload-url`,
      { body: { fileName: file.name, mimeType: mime, sizeBytes: file.size } },
    );
    const token = new URL(ticket.signedUrl).searchParams.get('token');
    if (!token) throw new Error('Upload authorization is missing.');
    const { error } = await supabase.storage.from('project-submissions').uploadToSignedUrl(ticket.path, token, file, { contentType: mime });
    if (error) throw new Error('Could not upload the project file.');
    return { storagePath: ticket.path, fileName: ticket.safeName, fileMime: mime, fileSizeBytes: file.size };
  },

  submitProject: (id: string, repo: string, note: string, extra?: { fileName?: string; fileMime?: string; fileBase64?: string; storagePath?: string; fileSizeBytes?: number; languageCode?: string }) =>
    call<{ submission: Record<string, unknown> }>(`/api/projects/${encodeURIComponent(id)}/submissions`, {
      body: { ...(repo ? { repo } : {}), note, ...extra },
    }),

  issueCertificate: (templateId: string) =>
    call<{ certificate: { verificationCode: string } }>(`/api/certificates/${encodeURIComponent(templateId)}/issue`, { body: {} }),

  certificatePdfUrl: (code: string) => buildUrl(`/api/certificates/${encodeURIComponent(code)}/pdf`),

  verifyCertificate: (id: string) =>
    call<Certificate>(`/api/verify/${encodeURIComponent(id)}`, { auth: false }).then((c): Certificate => ({ ...c, source: 'api' })),

  updatePortfolio: (patch: { portfolioSlug?: string | null; portfolioPublic?: boolean; showScoresPublic?: boolean; githubUsername?: string }) =>
    call<{ profile: RemoteProfile }>('/api/portfolio', { method: 'PATCH', body: patch }),

  publicPortfolio: (slug: string) =>
    call<{ portfolio: PublicPortfolioData }>(`/api/portfolio/${encodeURIComponent(slug)}`, { auth: false }),

  // Instructor & Admin APIs
  instructorOverview: () => call<{ counts: Record<string, number>; projects: { id: string; title: string; rubric: { criterion: string; maxPoints: number }[] }[] }>('/api/instructor/overview'),
  instructorSubmissions: () => call<{ submissions: { id: string; projectId: string; userId: string; version: number; repoUrl: string | null; fileName: string | null; note: string; status: string; overallScore: number | null; createdAt: string }[] }>('/api/instructor/submissions'),
  submissionFile: (id: string) => call<{ signedUrl: string }>(`/api/instructor/submissions/${encodeURIComponent(id)}/file`),
  reviewSubmission: (id: string, body: { rubricScores: { criterion: string; score: number; maxPoints: number; comment: string }[]; feedback: string; approved: boolean }) =>
    call(`/api/instructor/submissions/${encodeURIComponent(id)}/review`, { body }),
  adminOverview: () => call<{ usersCount: number; roles: Record<string, number>; coursesCount: number; languagesCount: number; aiUsage: { totalRequests: number; byEndpoint: Record<string, number>; byStatus: Record<string, number> } }>('/api/admin/overview'),
  adminUsers: () => call<{ users: RemoteProfile[] }>('/api/admin/users'),
  setUserRole: (userId: string, role: UserRole) => call<{ user: RemoteProfile }>(`/api/admin/users/${encodeURIComponent(userId)}/role`, { method: 'PATCH', body: { role } }),
  revokeCertificate: (certId: string, reason: string) => call(`/api/admin/certificates/${encodeURIComponent(certId)}/revoke`, { body: { reason } }),
  adminAuditLogs: () => call<{ logs: { id: string; action: string; resource_type: string; resource_id: string | null; created_at: string }[] }>('/api/admin/audit-logs'),
};

/** What each screen needs from the backend. Listed in Settings -> Integrations. */
export const INTEGRATIONS = [
  { name: 'Learner records', needs: 'GET /api/me/workspace (Supabase RLS)', used: 'Dashboard, skills, courses, projects, certificates' },
  { name: 'Sign-in', needs: 'Supabase Auth (Email, Google OAuth, Recovery)', used: 'Log in, Register' },
  { name: 'Project evaluation', needs: 'POST /api/projects/:id/submissions + Instructor Review', used: 'Project Labs' },
  { name: 'Certificate verification', needs: 'GET /api/verify/:code (HMAC-SHA256)', used: 'Certificates, public verify page' },
  { name: 'AI assistant', needs: 'POST /api/ai/tutor, POST /api/ai/roadmap (Gemini)', used: 'AI Assistant' },
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
