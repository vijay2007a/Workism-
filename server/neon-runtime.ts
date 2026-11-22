import { neon } from '@neondatabase/serverless';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as sample from '../src/data/sample.ts';
import type { ServerEnv } from './env.ts';
import { ApiError } from './security.ts';
import { createSupabaseRuntime } from './supabase-runtime.ts';
import type {
  AuthUser,
  BackendRuntime,
  CertificateTemplateRecord,
  CourseRecord,
  ProfileRecord,
  ProjectCatalogRecord,
  Role,
  SkillCatalogItem,
  UserSkillView,
} from './types.ts';

export type NeonQueryExecutor = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

export interface VerifiedSupabaseIdentity {
  id: string;
  email: string;
  displayName: string;
}

export interface NeonRuntimeDeps {
  query?: NeonQueryExecutor;
  verifySupabaseUser?: (token: string) => Promise<VerifiedSupabaseIdentity | null>;
  /** Preserves all unmigrated workflows (assessments, tutor, storage, certs, staff) instead of returning 501. */
  fallback?: BackendRuntime;
}

const PROFILE_COLUMNS = [
  'id',
  'role',
  'display_name',
  'email',
  'career_goal',
  'interests',
  'learning_style',
  'learning_pace',
  'preferred_language',
  'preferred_code_language',
  'github_username',
  'portfolio_slug',
  'portfolio_public',
  'show_scores_public',
  'in_app_notices',
].join(', ');

const UPDATABLE_PROFILE_FIELDS: ReadonlyArray<readonly [keyof Omit<ProfileRecord, 'id' | 'role' | 'email'>, string]> = [
  ['displayName', 'display_name'],
  ['careerGoal', 'career_goal'],
  ['interests', 'interests'],
  ['learningStyle', 'learning_style'],
  ['learningPace', 'learning_pace'],
  ['preferredLanguage', 'preferred_language'],
  ['preferredCodeLanguage', 'preferred_code_language'],
  ['githubUsername', 'github_username'],
  ['portfolioSlug', 'portfolio_slug'],
  ['portfolioPublic', 'portfolio_public'],
  ['showScoresPublic', 'show_scores_public'],
  ['inAppNotices', 'in_app_notices'],
];

function mapProfile(row: Record<string, unknown>): ProfileRecord {
  const rawRole = String(row.role ?? 'student');
  const role: Role = rawRole === 'admin' || rawRole === 'instructor' ? rawRole : 'student';
  return {
    id: String(row.id),
    role,
    displayName: String(row.display_name ?? ''),
    email: String(row.email ?? ''),
    careerGoal: String(row.career_goal ?? ''),
    interests: Array.isArray(row.interests) ? row.interests.map(String) : [],
    learningStyle: String(row.learning_style ?? ''),
    learningPace: String(row.learning_pace ?? ''),
    preferredLanguage: String(row.preferred_language ?? 'en'),
    preferredCodeLanguage: String(row.preferred_code_language ?? ''),
    githubUsername: String(row.github_username ?? ''),
    portfolioSlug: row.portfolio_slug ? String(row.portfolio_slug) : null,
    portfolioPublic: Boolean(row.portfolio_public),
    showScoresPublic: Boolean(row.show_scores_public),
    inAppNotices: row.in_app_notices !== false,
  };
}

function assertSelf(targetUserId: string, caller: AuthUser): void {
  if (targetUserId !== caller.id) {
    throw new ApiError(403, 'forbidden', 'You do not have permission to access another user workspace.');
  }
}

function pgErrorCode(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    return String((err as { code?: unknown }).code ?? '');
  }
  return '';
}

// shortcut: static catalog fallback used only when SUPABASE_SECRET_KEY is unset alongside DATABASE_URL
const STATIC_SKILLS: SkillCatalogItem[] = sample.workspace.skills.map((s) => ({
  id: s.id,
  name: s.name,
  categoryId: s.id === 'cl' ? 'infrastructure' : s.id === 'ml' || s.id === 'db' ? 'ai-data' : 'programming',
  defaultTarget: s.target,
}));

const STATIC_COURSES: CourseRecord[] = sample.workspace.courses.map((c) => ({
  id: c.id,
  skill: c.skill,
  title: c.title,
  blurb: c.blurb,
  level: c.level,
  modules: c.modules.map((m, idx) => ({
    id: `${c.id}-m${idx + 1}`,
    title: m.title,
    lessons: m.lessons.map((l) => ({ ...l, moduleId: `${c.id}-m${idx + 1}`, courseId: c.id })),
  })),
}));

const STATIC_PROJECTS: ProjectCatalogRecord[] = sample.workspace.projects.map((p) => ({
  id: p.id,
  title: p.title,
  skills: [...p.skills],
  level: p.level,
  hours: p.hours,
  brief: p.brief,
  requirements: [...p.requirements],
  rubric: p.rubric.map((criterion, index) => ({ criterion, description: criterion, maxPoints: index === 0 ? 40 : 30 })),
}));

const STATIC_CERT_TEMPLATES: CertificateTemplateRecord[] = sample.workspace.certificates.map((c) => ({
  id: c.id,
  title: c.title,
  skillId: c.skill,
  courseId: c.course,
  projectId: c.project,
  passMark: 70,
}));

/**
 * Hybrid Neon + Supabase runtime:
 * - Migrated profile/workspace operations read and write Neon (DATABASE_URL) via parameterized SQL
 *   with explicit caller-ownership enforcement and Supabase publishable-key JWT verification.
 * - Unmigrated operations (assessments, courses/progress, roadmaps, AI tutor, code execution,
 *   projects/Supabase Storage, certificates, staff consoles, rate limiting, audit logs) delegate
 *   to the existing Supabase runtime instead of returning 501.
 */
export function createNeonRuntime(env: ServerEnv, deps: NeonRuntimeDeps = {}): BackendRuntime {
  const fallback = deps.fallback ?? createSupabaseRuntime(env);
  const hasFallbackDb = Boolean(deps.fallback) || Boolean(env.supabaseUrl && env.supabasePublishableKey && env.supabaseSecretKey);

  let sqlCache: NeonQueryExecutor | null = deps.query ?? null;
  const runQuery: NeonQueryExecutor = async (text, params = []) => {
    if (!sqlCache) {
      if (!env.databaseUrl) {
        throw new ApiError(503, 'database_not_configured', 'Database configuration is missing.');
      }
      const sql = neon(env.databaseUrl);
      sqlCache = async (q, p = []) => (await sql.query(q, p)) as Record<string, unknown>[];
    }
    return sqlCache(text, params);
  };

  let authClientCache: SupabaseClient | null = null;
  const supabaseAuth = (): SupabaseClient => {
    if (!env.supabaseUrl || !env.supabasePublishableKey) {
      throw new ApiError(503, 'auth_not_configured', 'Supabase Auth configuration is missing.');
    }
    if (!authClientCache) {
      authClientCache = createClient(env.supabaseUrl, env.supabasePublishableKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    }
    return authClientCache;
  };

  const verifyIdentity = async (token: string): Promise<VerifiedSupabaseIdentity | null> => {
    if (deps.verifySupabaseUser) return deps.verifySupabaseUser(token);
    if (deps.fallback) {
      const u = await deps.fallback.auth.verifyToken(token);
      return u ? { id: u.id, email: u.email, displayName: u.displayName } : null;
    }
    const { data, error } = await supabaseAuth().auth.getUser(token);
    if (error || !data.user) return null;
    const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
    const rawName = typeof meta.display_name === 'string'
      ? meta.display_name
      : typeof meta.full_name === 'string'
        ? meta.full_name
        : '';
    return {
      id: data.user.id,
      email: data.user.email ?? '',
      displayName: rawName.trim().slice(0, 60),
    };
  };

  /** Idempotently provisions a verified user's Neon profile with hardcoded 'student' role. */
  const ensureProfile = async (userId: string, email: string, initialDisplayName: string): Promise<ProfileRecord> => {
    const safeName = initialDisplayName.trim().slice(0, 60);
    await runQuery(
      `insert into public.profiles (id, role, display_name, email)
       values ($1, 'student', $2, $3)
       on conflict (id) do nothing`,
      [userId, safeName, email],
    );
    const rows = await runQuery(
      `select ${PROFILE_COLUMNS} from public.profiles where id = $1`,
      [userId],
    );
    if (!rows[0]) {
      throw new ApiError(500, 'profile_unavailable', 'Could not load user profile.');
    }
    return mapProfile(rows[0]);
  };

  return {
    auth: {
      async verifyToken(token: string): Promise<AuthUser | null> {
        const identity = await verifyIdentity(token);
        if (!identity) return null;
        const profile = await ensureProfile(identity.id, identity.email, identity.displayName);
        return {
          id: identity.id,
          email: identity.email || profile.email,
          role: profile.role,
          displayName: profile.displayName,
          token,
        };
      },

      async register(name, email, password, redirectTo) {
        if (deps.fallback) return deps.fallback.auth.register(name, email, password, redirectTo);
        const { data, error } = await supabaseAuth().auth.signUp({
          email,
          password,
          options: {
            data: { display_name: name.slice(0, 60) },
            ...(redirectTo ? { emailRedirectTo: redirectTo } : {}),
          },
        });
        if (error || !data.user) {
          throw new ApiError(400, 'registration_failed', error?.message || 'Registration failed.');
        }
        return {
          userId: data.user.id,
          emailConfirmed: Boolean(data.session),
          accessToken: data.session?.access_token,
          refreshToken: data.session?.refresh_token,
        };
      },

      async login(email, password) {
        if (deps.fallback) {
          const res = await deps.fallback.auth.login(email, password);
          const profile = await ensureProfile(res.user.id, res.user.email, res.user.displayName);
          return { ...res, user: { ...res.user, role: profile.role, displayName: profile.displayName } };
        }
        const { data, error } = await supabaseAuth().auth.signInWithPassword({ email, password });
        if (error || !data.session || !data.user) {
          throw new ApiError(401, 'invalid_credentials', 'Invalid email or password.');
        }
        const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
        const initialName = typeof meta.display_name === 'string' ? meta.display_name : '';
        const profile = await ensureProfile(data.user.id, data.user.email ?? email, initialName);
        return {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          user: {
            id: data.user.id,
            email: data.user.email ?? email,
            role: profile.role,
            displayName: profile.displayName,
            token: data.session.access_token,
          },
        };
      },

      logout: (token) => fallback.auth.logout(token),

      async recoverPassword(email, redirectTo) {
        if (deps.fallback) return deps.fallback.auth.recoverPassword(email, redirectTo);
        const { error } = await supabaseAuth().auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw new ApiError(400, 'recovery_failed', 'Could not start password recovery.');
      },

      resetPassword: (token, newPassword) => fallback.auth.resetPassword(token, newPassword),

      async googleOAuthUrl(redirectTo) {
        if (deps.fallback) return deps.fallback.auth.googleOAuthUrl(redirectTo);
        const { data, error } = await supabaseAuth().auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo, skipBrowserRedirect: true },
        });
        if (error || !data.url) throw new ApiError(503, 'oauth_unavailable', 'Google sign-in is not configured.');
        return data.url;
      },
    },

    rateLimit: (key, limit, windowSeconds) => fallback.rateLimit(key, limit, windowSeconds),
    auditLog: (entry) => fallback.auditLog(entry),
    ai: fallback.ai,
    sandbox: fallback.sandbox,
    storage: fallback.storage,

    db: {
      ...fallback.db,

      async getProfile(userId, caller) {
        assertSelf(userId, caller);
        return ensureProfile(caller.id, caller.email, caller.displayName);
      },

      async updateProfile(userId, patch, caller) {
        assertSelf(userId, caller);
        const existing = await ensureProfile(caller.id, caller.email, caller.displayName);

        const sets: string[] = [];
        const params: unknown[] = [caller.id];
        for (const [key, column] of UPDATABLE_PROFILE_FIELDS) {
          const val = patch[key];
          if (val !== undefined) {
            params.push(val);
            sets.push(`${column} = $${params.length}`);
          }
        }
        if (sets.length === 0) return existing;

        let updated: ProfileRecord;
        try {
          const rows = await runQuery(
            `update public.profiles set ${sets.join(', ')} where id = $1 returning ${PROFILE_COLUMNS}`,
            params,
          );
          if (!rows[0]) throw new ApiError(404, 'not_found', 'Profile not found.');
          updated = mapProfile(rows[0]);
        } catch (err) {
          if (err instanceof ApiError) throw err;
          const code = pgErrorCode(err);
          if (code === '23505') {
            throw new ApiError(409, 'portfolio_slug_taken', 'That portfolio slug is already taken.');
          }
          if (code === '23514' || code === '22P02') {
            throw new ApiError(400, 'profile_update_failed', 'Invalid profile value.');
          }
          throw new ApiError(500, 'database_error', 'Could not update profile.');
        }

        // Keep fallback profile in sync for unmigrated RPCs (e.g. public portfolio) when hybrid DB is active.
        if (hasFallbackDb) {
          await fallback.db.updateProfile(userId, patch, caller).catch(() => {});
        }
        return updated;
      },

      async listAllProfiles(caller) {
        if (caller.role !== 'admin') throw new ApiError(403, 'forbidden', 'Administrator access required.');
        if (hasFallbackDb) return fallback.db.listAllProfiles(caller);
        const rows = await runQuery(`select ${PROFILE_COLUMNS} from public.profiles order by created_at desc limit 200`);
        return rows.map(mapProfile);
      },

      async setUserRole(targetUserId, role, caller) {
        if (caller.role !== 'admin') throw new ApiError(403, 'forbidden', 'Administrator access required.');
        const rows = await runQuery(
          `update public.profiles set role = $2 where id = $1 returning ${PROFILE_COLUMNS}`,
          [targetUserId, role],
        );
        if (hasFallbackDb) {
          const fb = await fallback.db.setUserRole(targetUserId, role, caller);
          return rows[0] ? mapProfile(rows[0]) : fb;
        }
        if (!rows[0]) throw new ApiError(404, 'user_not_found', 'User not found.');
        return mapProfile(rows[0]);
      },

      async listSkills() {
        return hasFallbackDb ? fallback.db.listSkills() : STATIC_SKILLS;
      },

      async getUserSkills(userId, caller): Promise<UserSkillView[]> {
        assertSelf(userId, caller);
        if (hasFallbackDb) return fallback.db.getUserSkills(userId, caller);
        return STATIC_SKILLS.map((sk) => ({
          id: sk.id,
          name: sk.name,
          score: 0,
          target: sk.defaultTarget,
          history: [0],
          source: 'api',
        }));
      },

      async listCourses() {
        return hasFallbackDb ? fallback.db.listCourses() : STATIC_COURSES;
      },

      async listLessonsDone(userId, caller) {
        assertSelf(userId, caller);
        return hasFallbackDb ? fallback.db.listLessonsDone(userId, caller) : [];
      },

      async getActiveRoadmap(userId, caller) {
        assertSelf(userId, caller);
        return hasFallbackDb ? fallback.db.getActiveRoadmap(userId, caller) : null;
      },

      async listProjects() {
        return hasFallbackDb ? fallback.db.listProjects() : STATIC_PROJECTS;
      },

      async listUserProjectSubmissions(userId, caller) {
        assertSelf(userId, caller);
        return hasFallbackDb ? fallback.db.listUserProjectSubmissions(userId, caller) : [];
      },

      async listCertificateTemplates() {
        return hasFallbackDb ? fallback.db.listCertificateTemplates() : STATIC_CERT_TEMPLATES;
      },

      async listUserCertificates(userId, caller) {
        assertSelf(userId, caller);
        return hasFallbackDb ? fallback.db.listUserCertificates(userId, caller) : [];
      },

      async listNotifications(userId) {
        return hasFallbackDb ? fallback.db.listNotifications(userId) : [];
      },
    },
  };
}
