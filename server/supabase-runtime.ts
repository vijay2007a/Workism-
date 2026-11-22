import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createGeminiClient } from './ai.ts';
import type { ServerEnv } from './env.ts';
import { createSandboxRunner } from './execution.ts';
import { ApiError } from './security.ts';
import type {
  AssessmentAttemptRecord,
  AssessmentQuestionInternal,
  AuthUser,
  BackendRuntime,
  CertificateTemplateRecord,
  CourseRecord,
  IssuedCertificateRecord,
  LessonRecord,
  NotificationRecord,
  ProfileRecord,
  ProjectCatalogRecord,
  ProjectEvaluationRecord,
  ProjectSubmissionRecord,
  Role,
  SkillCatalogItem,
  SpokenLanguageRecord,
  TutorMessageRecord,
  UserSkillView,
} from './types.ts';

function mapProfile(row: Record<string, unknown>): ProfileRecord {
  return {
    id: String(row.id),
    role: (row.role as Role) ?? 'student',
    displayName: String(row.display_name ?? ''),
    email: String(row.email ?? ''),
    careerGoal: String(row.career_goal ?? ''),
    interests: Array.isArray(row.interests) ? (row.interests as string[]) : [],
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

function mapSubmission(row: Record<string, unknown>): ProjectSubmissionRecord {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    userId: String(row.user_id),
    version: Number(row.version ?? 1),
    repoUrl: row.repo_url ? String(row.repo_url) : null,
    storagePath: row.storage_path ? String(row.storage_path) : null,
    fileName: row.file_name ? String(row.file_name) : null,
    fileSizeBytes: typeof row.file_size_bytes === 'number' ? row.file_size_bytes : null,
    fileMime: row.file_mime ? String(row.file_mime) : null,
    note: String(row.note ?? ''),
    status: (row.status as ProjectSubmissionRecord['status']) ?? 'submitted',
    overallScore: typeof row.overall_score === 'number' ? row.overall_score : null,
    aiFeedback: row.ai_feedback ? String(row.ai_feedback) : null,
    automatedTests: (row.automated_tests as ProjectSubmissionRecord['automatedTests']) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapCertificate(row: Record<string, unknown>): IssuedCertificateRecord {
  return {
    id: String(row.id),
    verificationCode: String(row.verification_code),
    templateId: String(row.template_id),
    userId: String(row.user_id),
    holderName: String(row.holder_name),
    title: String(row.title),
    skillName: String(row.skill_name),
    status: (row.status as 'verified' | 'revoked') ?? 'verified',
    issuedAt: String(row.issued_at),
    issuedBy: row.issued_by ? String(row.issued_by) : null,
    signatureAlg: String(row.signature_alg ?? 'HMAC-SHA256'),
    signaturePayload: (row.signature_payload as Record<string, unknown>) ?? {},
    signatureHex: String(row.signature_hex),
    revokedAt: row.revoked_at ? String(row.revoked_at) : null,
    revokedBy: row.revoked_by ? String(row.revoked_by) : null,
    revocationReason: row.revocation_reason ? String(row.revocation_reason) : null,
  };
}

export function createSupabaseRuntime(env: ServerEnv): BackendRuntime {
  const ensureConfigured = () => {
    if (!env.supabaseUrl || !env.supabasePublishableKey || !env.supabaseSecretKey) {
      throw new ApiError(503, 'supabase_not_configured', 'Supabase server configuration is missing.');
    }
  };

  let adminClientCache: SupabaseClient | null = null;
  const admin = (): SupabaseClient => {
    ensureConfigured();
    if (!adminClientCache) {
      adminClientCache = createClient(env.supabaseUrl, env.supabaseSecretKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    }
    return adminClientCache;
  };

  /** Public publishable client (respects RLS; never bypasses policies). */
  const anon = (): SupabaseClient => {
    ensureConfigured();
    return createClient(env.supabaseUrl, env.supabasePublishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  };

  /** User-scoped RLS client carrying the verified caller JWT. */
  const asUser = (token: string): SupabaseClient => {
    ensureConfigured();
    return createClient(env.supabaseUrl, env.supabasePublishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
  };

  const getDailyUsageCount = async (userId: string): Promise<number> => {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const { count, error } = await admin()
      .from('ai_usage_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'ok')
      .gte('created_at', startOfDay.toISOString());
    if (error) return 0;
    return count ?? 0;
  };

  const gemini = createGeminiClient(
    env,
    async (entry) => {
      await admin().from('ai_usage_logs').insert({
        user_id: entry.userId,
        endpoint: entry.endpoint,
        model: entry.model,
        language_code: entry.languageCode,
        prompt_tokens: entry.promptTokens,
        output_tokens: entry.outputTokens,
        latency_ms: entry.latencyMs,
        status: entry.status,
      });
    },
    getDailyUsageCount,
  );

  const sandbox = createSandboxRunner(env);

  return {
    auth: {
      async verifyToken(token: string): Promise<AuthUser | null> {
        const { data, error } = await anon().auth.getUser(token);
        if (error || !data.user) return null;
        const { data: profile } = await admin()
          .from('profiles')
          .select('role, display_name, email')
          .eq('id', data.user.id)
          .maybeSingle();
        return {
          id: data.user.id,
          email: data.user.email ?? String(profile?.email ?? ''),
          role: (profile?.role as Role) ?? 'student',
          displayName: String(profile?.display_name ?? ''),
          token,
        };
      },

      async register(name: string, email: string, password: string, redirectTo?: string) {
        // Role is NEVER supplied by public registration; DB trigger forces 'student'.
        const { data, error } = await anon().auth.signUp({
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

      async login(email: string, password: string) {
        const { data, error } = await anon().auth.signInWithPassword({ email, password });
        if (error || !data.session || !data.user) {
          throw new ApiError(401, 'invalid_credentials', 'Invalid email or password.');
        }
        const { data: profile } = await admin()
          .from('profiles')
          .select('role, display_name')
          .eq('id', data.user.id)
          .maybeSingle();
        return {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          user: {
            id: data.user.id,
            email: data.user.email ?? email,
            role: (profile?.role as Role) ?? 'student',
            displayName: String(profile?.display_name ?? ''),
            token: data.session.access_token,
          },
        };
      },

      async logout(token: string) {
        await asUser(token).auth.signOut();
      },

      async recoverPassword(email: string, redirectTo: string) {
        const { error } = await anon().auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw new ApiError(400, 'recovery_failed', 'Could not start password recovery.');
      },

      async resetPassword(token: string, newPassword: string) {
        const user = await anon().auth.getUser(token);
        if (user.error || !user.data.user) {
          throw new ApiError(401, 'unauthorized', 'Valid recovery session required.');
        }
        const { error } = await admin().auth.admin.updateUserById(user.data.user.id, { password: newPassword });
        if (error) throw new ApiError(400, 'password_reset_failed', 'Could not update password.');
      },

      async googleOAuthUrl(redirectTo: string) {
        const { data, error } = await anon().auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo, skipBrowserRedirect: true },
        });
        if (error || !data.url) throw new ApiError(503, 'oauth_unavailable', 'Google sign-in is not configured.');
        return data.url;
      },
    },

    async rateLimit(key: string, limit: number, windowSeconds: number) {
      const { data, error } = await admin().rpc('check_rate_limit', {
        p_key: key,
        p_limit: limit,
        p_window_seconds: windowSeconds,
      });
      if (error || !Array.isArray(data) || !data[0]) {
        throw new ApiError(503, 'rate_limit_unavailable', 'Rate limit service temporarily unavailable.');
      }
      const row = data[0] as { allowed: boolean; remaining: number; reset_at: string };
      return { allowed: row.allowed, remaining: row.remaining, resetAt: row.reset_at };
    },

    async auditLog(entry) {
      await admin().from('security_audit_logs').insert({
        actor_id: entry.actorId ?? null,
        action: entry.action,
        resource_type: entry.resourceType,
        resource_id: entry.resourceId ?? null,
        ip_hash: entry.ipHash ?? null,
        metadata: entry.metadata ?? {},
      });
    },

    ai: {
      complete: gemini.complete,
      getDailyUsageCount,
      async listUsageSummary() {
        const { data } = await admin().from('ai_usage_logs').select('endpoint, status').limit(2000);
        const rows = (data ?? []) as { endpoint: string; status: string }[];
        const byEndpoint: Record<string, number> = {};
        const byStatus: Record<string, number> = {};
        for (const r of rows) {
          byEndpoint[r.endpoint] = (byEndpoint[r.endpoint] ?? 0) + 1;
          byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
        }
        return { totalRequests: rows.length, byEndpoint, byStatus };
      },
    },

    sandbox,

    storage: {
      async createSignedUploadUrl(_userId, objectPath, _contentType) {
        const { data, error } = await admin().storage
          .from('project-submissions')
          .createSignedUploadUrl(objectPath);
        if (error || !data) throw new ApiError(500, 'storage_error', 'Could not prepare file upload URL.');
        return { signedUrl: data.signedUrl, path: data.path, expiresInSeconds: 120 };
      },
      async createSignedDownloadUrl(objectPath) {
        const { data, error } = await admin().storage
          .from('project-submissions')
          .createSignedUrl(objectPath, 300);
        if (error || !data) throw new ApiError(404, 'file_not_found', 'Uploaded file not found.');
        return { signedUrl: data.signedUrl, expiresInSeconds: 300 };
      },
    },

    db: {
      async getProfile(userId, caller) {
        const { data, error } = await asUser(caller.token)
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();
        if (error || !data) return null;
        return mapProfile(data as Record<string, unknown>);
      },

      async updateProfile(userId, patch, caller) {
        const payload: Record<string, unknown> = {};
        if (patch.displayName !== undefined) payload.display_name = patch.displayName;
        if (patch.careerGoal !== undefined) payload.career_goal = patch.careerGoal;
        if (patch.interests !== undefined) payload.interests = patch.interests;
        if (patch.learningStyle !== undefined) payload.learning_style = patch.learningStyle;
        if (patch.learningPace !== undefined) payload.learning_pace = patch.learningPace;
        if (patch.preferredLanguage !== undefined) payload.preferred_language = patch.preferredLanguage;
        if (patch.preferredCodeLanguage !== undefined) payload.preferred_code_language = patch.preferredCodeLanguage;
        if (patch.githubUsername !== undefined) payload.github_username = patch.githubUsername;
        if (patch.portfolioSlug !== undefined) payload.portfolio_slug = patch.portfolioSlug;
        if (patch.portfolioPublic !== undefined) payload.portfolio_public = patch.portfolioPublic;
        if (patch.showScoresPublic !== undefined) payload.show_scores_public = patch.showScoresPublic;
        if (patch.inAppNotices !== undefined) payload.in_app_notices = patch.inAppNotices;

        const { data, error } = await asUser(caller.token)
          .from('profiles')
          .update(payload)
          .eq('id', userId)
          .select('*')
          .single();
        if (error || !data) throw new ApiError(400, 'profile_update_failed', 'Could not update profile.');
        return mapProfile(data as Record<string, unknown>);
      },

      async listAllProfiles(caller) {
        if (caller.role !== 'admin') throw new ApiError(403, 'forbidden', 'Administrator access required.');
        const { data } = await admin().from('profiles').select('*').order('created_at', { ascending: false }).limit(200);
        return (data ?? []).map((r) => mapProfile(r as Record<string, unknown>));
      },

      async setUserRole(targetUserId, role, caller) {
        if (caller.role !== 'admin') throw new ApiError(403, 'forbidden', 'Administrator access required.');
        const { data, error } = await admin().from('profiles').update({ role }).eq('id', targetUserId).select('*').single();
        if (error || !data) throw new ApiError(404, 'user_not_found', 'User not found.');
        return mapProfile(data as Record<string, unknown>);
      },

      async getPublicPortfolio(slug) {
        const { data, error } = await anon().rpc('get_public_portfolio', { p_slug: slug });
        if (error || !data) return null;
        return data as Record<string, unknown>;
      },

      async listSpokenLanguages(includeDisabled = false) {
        const q = admin().from('spoken_languages').select('*').order('sort_order');
        const { data } = includeDisabled ? await q : await q.eq('enabled', true);
        return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
          code: String(r.code),
          nativeName: String(r.native_name),
          englishName: String(r.english_name),
          isRtl: Boolean(r.is_rtl),
          aiQualityTier: (r.ai_quality_tier as SpokenLanguageRecord['aiQualityTier']) ?? 'high',
          enabled: Boolean(r.enabled),
        }));
      },

      async setSpokenLanguageEnabled(code, enabled, caller) {
        if (caller.role !== 'admin') throw new ApiError(403, 'forbidden', 'Administrator access required.');
        const { data, error } = await admin().from('spoken_languages').update({ enabled }).eq('code', code).select('*').single();
        if (error || !data) throw new ApiError(404, 'language_not_found', 'Language not found.');
        const r = data as Record<string, unknown>;
        return {
          code: String(r.code),
          nativeName: String(r.native_name),
          englishName: String(r.english_name),
          isRtl: Boolean(r.is_rtl),
          aiQualityTier: (r.ai_quality_tier as SpokenLanguageRecord['aiQualityTier']) ?? 'high',
          enabled: Boolean(r.enabled),
        };
      },

      async listProgrammingLanguages(includeDisabled = false) {
        const q = admin().from('programming_languages').select('*').order('sort_order');
        const { data } = includeDisabled ? await q : await q.eq('enabled', true);
        return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
          id: String(r.id),
          name: String(r.name),
          mark: String(r.mark),
          color: String(r.color),
          kinds: Array.isArray(r.kinds) ? (r.kinds as string[]) : [],
          note: String(r.note ?? ''),
          capabilities: {
            canAiExplain: Boolean(r.can_ai_explain),
            hasAssessments: Boolean(r.has_assessments),
            canExecuteSandbox: Boolean(r.can_execute_sandbox),
            executionRuntime: r.execution_runtime ? String(r.execution_runtime) : null,
          },
          enabled: Boolean(r.enabled),
        }));
      },

      async listSkills(): Promise<SkillCatalogItem[]> {
        const { data } = await admin().from('skills').select('*').order('sort_order');
        return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
          id: String(r.id),
          name: String(r.name),
          categoryId: String(r.category_id),
          defaultTarget: Number(r.default_target ?? 75),
        }));
      },

      async getUserSkills(userId, caller): Promise<UserSkillView[]> {
        const client = asUser(caller.token);
        const [{ data: skills }, { data: scores }, { data: history }] = await Promise.all([
          client.from('skills').select('*').order('sort_order'),
          client.from('user_skill_scores').select('*').eq('user_id', userId),
          client.from('skill_history').select('skill_id, score').eq('user_id', userId).order('recorded_at', { ascending: true }),
        ]);
        const scoreMap = new Map(((scores ?? []) as Record<string, unknown>[]).map((s) => [String(s.skill_id), s]));
        const histMap = new Map<string, number[]>();
        for (const h of (history ?? []) as { skill_id: string; score: number }[]) {
          const list = histMap.get(h.skill_id) ?? [];
          list.push(h.score);
          histMap.set(h.skill_id, list.slice(-12));
        }
        return ((skills ?? []) as Record<string, unknown>[]).map((sk) => {
          const id = String(sk.id);
          const cur = scoreMap.get(id);
          const score = cur ? Number(cur.score) : 0;
          const target = cur ? Number(cur.target) : Number(sk.default_target ?? 75);
          const hist = histMap.get(id) ?? [score];
          return { id, name: String(sk.name), score, target, history: hist, source: 'api' };
        });
      },

      async getAssessmentBySkill(skillId) {
        const { data: assessment } = await admin()
          .from('skill_assessments')
          .select('*')
          .eq('skill_id', skillId)
          .eq('active', true)
          .maybeSingle();
        if (!assessment) return null;
        const { data: questions } = await admin()
          .from('assessment_questions')
          .select('id, prompt, options, explanation, difficulty, sort_order, assessment_question_keys(correct_index)')
          .eq('assessment_id', assessment.id)
          .order('sort_order');

        const mapped: AssessmentQuestionInternal[] = ((questions ?? []) as Record<string, unknown>[]).map((q) => {
          const keyRel = q.assessment_question_keys as { correct_index?: number } | { correct_index?: number }[] | null;
          const correctIndex = Array.isArray(keyRel) ? (keyRel[0]?.correct_index ?? 0) : (keyRel?.correct_index ?? 0);
          return {
            id: String(q.id),
            prompt: String(q.prompt),
            options: Array.isArray(q.options) ? (q.options as string[]) : [],
            explanation: String(q.explanation ?? ''),
            difficulty: String(q.difficulty ?? 'core'),
            correctIndex,
          };
        });
        return {
          id: String(assessment.id),
          skillId: String(assessment.skill_id),
          title: String(assessment.title),
          passMark: Number(assessment.pass_mark ?? 70),
          timeLimitSeconds: Number(assessment.time_limit_seconds ?? 300),
          questions: mapped,
        };
      },

      async createAssessmentAttempt(userId, assessmentId, skillId, timeLimitSeconds, languageCode) {
        const expiresAt = new Date(Date.now() + timeLimitSeconds * 1000).toISOString();
        const { data, error } = await admin()
          .from('assessment_attempts')
          .insert({
            user_id: userId,
            assessment_id: assessmentId,
            skill_id: skillId,
            status: 'in_progress',
            expires_at: expiresAt,
            language_code: languageCode,
          })
          .select('*')
          .single();
        if (error || !data) throw new ApiError(500, 'attempt_create_failed', 'Could not start assessment attempt.');
        return {
          id: String(data.id),
          userId: String(data.user_id),
          assessmentId: String(data.assessment_id),
          skillId: String(data.skill_id),
          status: 'in_progress',
          startedAt: String(data.started_at),
          expiresAt: String(data.expires_at),
          submittedAt: null,
          answers: [],
          correctCount: null,
          totalCount: null,
          scorePercent: null,
          aiExplanation: null,
          languageCode: String(data.language_code ?? 'en'),
        };
      },

      async getAssessmentAttempt(attemptId, caller) {
        const { data } = await asUser(caller.token)
          .from('assessment_attempts')
          .select('*')
          .eq('id', attemptId)
          .maybeSingle();
        if (!data) return null;
        return {
          id: String(data.id),
          userId: String(data.user_id),
          assessmentId: String(data.assessment_id),
          skillId: String(data.skill_id),
          status: data.status as AssessmentAttemptRecord['status'],
          startedAt: String(data.started_at),
          expiresAt: String(data.expires_at),
          submittedAt: data.submitted_at ? String(data.submitted_at) : null,
          answers: Array.isArray(data.answers) ? (data.answers as (number | null)[]) : [],
          correctCount: typeof data.correct_count === 'number' ? data.correct_count : null,
          totalCount: typeof data.total_count === 'number' ? data.total_count : null,
          scorePercent: typeof data.score_percent === 'number' ? data.score_percent : null,
          aiExplanation: data.ai_explanation ? String(data.ai_explanation) : null,
          languageCode: String(data.language_code ?? 'en'),
        };
      },

      async completeAssessmentAttempt(input) {
        const now = new Date().toISOString();
        const { data, error } = await admin()
          .from('assessment_attempts')
          .update({
            status: 'submitted',
            submitted_at: now,
            answers: input.answers,
            correct_count: input.correctCount,
            total_count: input.totalCount,
            score_percent: input.scorePercent,
            ai_explanation: input.aiExplanation,
          })
          .eq('id', input.attemptId)
          .eq('user_id', input.userId)
          .select('*')
          .single();
        if (error || !data) throw new ApiError(500, 'attempt_submit_failed', 'Could not finalize attempt.');

        const { data: skillRow } = await admin().from('skills').select('default_target').eq('id', input.skillId).maybeSingle();
        await admin().from('user_skill_scores').upsert({
          user_id: input.userId,
          skill_id: input.skillId,
          score: input.scorePercent,
          target: Number(skillRow?.default_target ?? 75),
          source: 'assessed',
          updated_at: now,
        });
        await admin().from('skill_history').insert({
          user_id: input.userId,
          skill_id: input.skillId,
          score: input.scorePercent,
          attempt_id: input.attemptId,
        });

        return {
          id: String(data.id),
          userId: String(data.user_id),
          assessmentId: String(data.assessment_id),
          skillId: String(data.skill_id),
          status: 'submitted',
          startedAt: String(data.started_at),
          expiresAt: String(data.expires_at),
          submittedAt: now,
          answers: input.answers,
          correctCount: input.correctCount,
          totalCount: input.totalCount,
          scorePercent: input.scorePercent,
          aiExplanation: input.aiExplanation,
          languageCode: String(data.language_code ?? 'en'),
        };
      },

      async listCourses(): Promise<CourseRecord[]> {
        const [{ data: courses }, { data: modules }, { data: lessons }] = await Promise.all([
          admin().from('courses').select('*').eq('published', true).order('sort_order'),
          admin().from('course_modules').select('*').order('sort_order'),
          admin().from('lessons').select('*').order('sort_order'),
        ]);
        const lessonsByModule = new Map<string, LessonRecord[]>();
        for (const l of (lessons ?? []) as Record<string, unknown>[]) {
          const mid = String(l.module_id);
          const list = lessonsByModule.get(mid) ?? [];
          list.push({
            id: String(l.id),
            moduleId: mid,
            courseId: String(l.course_id),
            title: String(l.title),
            minutes: Number(l.minutes),
            body: Array.isArray(l.body) ? (l.body as string[]) : [],
            code: l.code_sample ? String(l.code_sample) : undefined,
            check: l.check_question as LessonRecord['check'],
          });
          lessonsByModule.set(mid, list);
        }
        const modulesByCourse = new Map<string, { id: string; title: string; lessons: LessonRecord[] }[]>();
        for (const m of (modules ?? []) as Record<string, unknown>[]) {
          const cid = String(m.course_id);
          const list = modulesByCourse.get(cid) ?? [];
          list.push({ id: String(m.id), title: String(m.title), lessons: lessonsByModule.get(String(m.id)) ?? [] });
          modulesByCourse.set(cid, list);
        }
        return ((courses ?? []) as Record<string, unknown>[]).map((c) => ({
          id: String(c.id),
          skill: String(c.skill_id),
          title: String(c.title),
          blurb: String(c.blurb),
          level: String(c.level),
          modules: modulesByCourse.get(String(c.id)) ?? [],
        }));
      },

      async createCourse(input) {
        const { error } = await admin().from('courses').insert({
          id: input.id,
          skill_id: input.skill,
          title: input.title,
          blurb: input.blurb,
          level: input.level,
          instructor_id: input.instructorId,
          published: true,
        });
        if (error) throw new ApiError(400, 'course_create_failed', 'Could not create course.');
        return { id: input.id, skill: input.skill, title: input.title, blurb: input.blurb, level: input.level, modules: [] };
      },

      async enrollCourse(userId, courseId) {
        await admin().from('enrollments').upsert({ user_id: userId, course_id: courseId });
      },

      async listLessonsDone(userId, caller) {
        const { data } = await asUser(caller.token).from('lesson_progress').select('lesson_id').eq('user_id', userId);
        return ((data ?? []) as { lesson_id: string }[]).map((r) => r.lesson_id);
      },

      async completeLesson(userId, courseId, lessonId, checkPassed) {
        await admin().from('enrollments').upsert({ user_id: userId, course_id: courseId });
        await admin().from('lesson_progress').upsert({
          user_id: userId,
          course_id: courseId,
          lesson_id: lessonId,
          check_passed: checkPassed,
        });
        const { data } = await admin().from('lesson_progress').select('lesson_id').eq('user_id', userId);
        return ((data ?? []) as { lesson_id: string }[]).map((r) => r.lesson_id);
      },

      async getActiveRoadmap(userId, caller) {
        const { data: map } = await asUser(caller.token)
          .from('learning_roadmaps')
          .select('*')
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!map) return null;
        const { data: items } = await asUser(caller.token)
          .from('roadmap_milestones')
          .select('*')
          .eq('roadmap_id', map.id)
          .order('sort_order');
        return {
          id: String(map.id),
          userId: String(map.user_id),
          goal: String(map.goal),
          preferredLanguage: String(map.preferred_language),
          summary: String(map.summary),
          milestones: ((items ?? []) as Record<string, unknown>[]).map((m) => ({
            courseId: m.course_id ? String(m.course_id) : null,
            skillId: m.skill_id ? String(m.skill_id) : null,
            title: String(m.title),
            objective: String(m.objective),
            lessonIds: Array.isArray(m.lesson_ids) ? (m.lesson_ids as string[]) : [],
          })),
          createdAt: String(map.created_at),
        };
      },

      async saveRoadmap(userId, goal, languageCode, summary, milestones) {
        await admin().from('learning_roadmaps').update({ status: 'archived' }).eq('user_id', userId).eq('status', 'active');
        const { data: map, error } = await admin()
          .from('learning_roadmaps')
          .insert({ user_id: userId, goal, preferred_language: languageCode, summary, status: 'active' })
          .select('*')
          .single();
        if (error || !map) throw new ApiError(500, 'roadmap_save_failed', 'Could not persist roadmap.');
        if (milestones.length) {
          await admin().from('roadmap_milestones').insert(
            milestones.map((m, idx) => ({
              roadmap_id: map.id,
              course_id: m.courseId,
              skill_id: m.skillId,
              title: m.title,
              objective: m.objective,
              lesson_ids: m.lessonIds,
              sort_order: idx + 1,
            })),
          );
        }
        return {
          id: String(map.id),
          userId,
          goal,
          preferredLanguage: languageCode,
          summary,
          milestones,
          createdAt: String(map.created_at),
        };
      },

      async listTutorMessages(userId, limit = 30): Promise<TutorMessageRecord[]> {
        const { data } = await admin()
          .from('tutor_messages')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(limit);
        return ((data ?? []) as Record<string, unknown>[]).reverse().map((r) => ({
          id: String(r.id),
          role: r.role as 'user' | 'assistant',
          text: String(r.content),
          languageCode: String(r.language_code ?? 'en'),
          createdAt: String(r.created_at),
        }));
      },

      async appendTutorMessages(userId, languageCode, userText, assistantText) {
        await admin().from('tutor_messages').insert([
          { user_id: userId, language_code: languageCode, role: 'user', content: userText },
          { user_id: userId, language_code: languageCode, role: 'assistant', content: assistantText },
        ]);
      },

      async clearTutorMessages(userId) {
        await admin().from('tutor_messages').delete().eq('user_id', userId);
      },

      async getChallenge(id) {
        const { data } = await admin()
          .from('coding_challenges')
          .select('*, coding_challenge_hidden_tests(tests)')
          .eq('id', id)
          .maybeSingle();
        if (!data) return null;
        const rel = data.coding_challenge_hidden_tests as { tests?: unknown[] } | { tests?: unknown[] }[] | null;
        const hiddenTests = (Array.isArray(rel) ? rel[0]?.tests : rel?.tests) ?? [];
        return {
          id: String(data.id),
          skillId: String(data.skill_id),
          languageId: String(data.language_id),
          title: String(data.title),
          fnName: String(data.fn_name),
          publicTests: (data.public_tests as { args: unknown[]; expected: unknown }[]) ?? [],
          hiddenTests: hiddenTests as { args: unknown[]; expected: unknown }[],
        };
      },

      async recordCodeSubmission(input) {
        const { data, error } = await admin()
          .from('code_submissions')
          .insert({
            user_id: input.userId,
            challenge_id: input.challengeId,
            language_id: input.languageId,
            source_code: input.sourceCode,
            execution_mode: input.executionMode,
            passed_count: input.passedCount,
            total_count: input.totalCount,
            results: input.results,
          })
          .select('id')
          .single();
        if (error || !data) throw new ApiError(500, 'submission_failed', 'Could not record code submission.');
        return { id: String(data.id) };
      },

      async listProjects(): Promise<ProjectCatalogRecord[]> {
        const [{ data: projects }, { data: rubrics }] = await Promise.all([
          admin().from('projects').select('*').eq('published', true).order('sort_order'),
          admin().from('project_rubrics').select('*').order('sort_order'),
        ]);
        const rubricMap = new Map<string, { criterion: string; description: string; maxPoints: number }[]>();
        for (const r of (rubrics ?? []) as Record<string, unknown>[]) {
          const pid = String(r.project_id);
          const list = rubricMap.get(pid) ?? [];
          list.push({ criterion: String(r.criterion), description: String(r.description ?? ''), maxPoints: Number(r.max_points ?? 25) });
          rubricMap.set(pid, list);
        }
        return ((projects ?? []) as Record<string, unknown>[]).map((p) => ({
          id: String(p.id),
          title: String(p.title),
          skills: Array.isArray(p.skill_ids) ? (p.skill_ids as string[]) : [],
          level: String(p.level),
          hours: Number(p.estimated_hours),
          brief: String(p.brief),
          requirements: Array.isArray(p.requirements) ? (p.requirements as string[]) : [],
          rubric: rubricMap.get(String(p.id)) ?? [],
          instructorId: p.instructor_id ? String(p.instructor_id) : null,
        }));
      },

      async listUserProjectSubmissions(userId, caller) {
        const { data } = await asUser(caller.token)
          .from('project_submissions')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });
        return ((data ?? []) as Record<string, unknown>[]).map(mapSubmission);
      },

      async listInstructorSubmissions(caller) {
        const client = caller.role === 'admin' ? admin() : asUser(caller.token);
        const { data } = await client.from('project_submissions').select('*').order('created_at', { ascending: false }).limit(100);
        return ((data ?? []) as Record<string, unknown>[]).map(mapSubmission);
      },

      async getProjectSubmission(submissionId, caller) {
        const client = caller.role === 'admin' ? admin() : asUser(caller.token);
        const { data } = await client.from('project_submissions').select('*').eq('id', submissionId).maybeSingle();
        return data ? mapSubmission(data as Record<string, unknown>) : null;
      },

      async createProjectSubmission(input) {
        const { count } = await admin()
          .from('project_submissions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', input.userId)
          .eq('project_id', input.projectId);
        const version = (count ?? 0) + 1;
        const { data, error } = await admin()
          .from('project_submissions')
          .insert({
            project_id: input.projectId,
            user_id: input.userId,
            version,
            repo_url: input.repoUrl,
            storage_path: input.storagePath,
            file_name: input.fileName,
            file_size_bytes: input.fileSizeBytes,
            file_mime: input.fileMime,
            note: input.note,
            status: input.aiFeedback ? 'evaluated' : 'submitted',
            ai_feedback: input.aiFeedback,
          })
          .select('*')
          .single();
        if (error || !data) throw new ApiError(400, 'submission_failed', 'Could not save project submission.');
        return mapSubmission(data as Record<string, unknown>);
      },

      async reviewProjectSubmission(input) {
        const nextStatus = input.approved ? 'verified' : 'changes_requested';
        const { data: sub, error: subErr } = await admin()
          .from('project_submissions')
          .update({
            status: nextStatus,
            overall_score: input.totalScore,
            ai_feedback: input.feedback,
          })
          .eq('id', input.submissionId)
          .select('*')
          .single();
        if (subErr || !sub) throw new ApiError(404, 'submission_not_found', 'Submission not found.');
        const { data: ev, error: evErr } = await admin()
          .from('project_evaluations')
          .insert({
            submission_id: input.submissionId,
            evaluator_id: input.evaluatorId,
            evaluator_type: 'instructor',
            rubric_scores: input.rubricScores,
            total_score: input.totalScore,
            feedback: input.feedback,
            approved: input.approved,
          })
          .select('*')
          .single();
        if (evErr || !ev) throw new ApiError(500, 'evaluation_failed', 'Could not save evaluation.');
        return {
          submission: mapSubmission(sub as Record<string, unknown>),
          evaluation: {
            id: String(ev.id),
            submissionId: String(ev.submission_id),
            evaluatorId: ev.evaluator_id ? String(ev.evaluator_id) : null,
            evaluatorType: 'instructor',
            rubricScores: input.rubricScores,
            totalScore: input.totalScore,
            feedback: input.feedback,
            approved: input.approved,
            createdAt: String(ev.created_at),
          } satisfies ProjectEvaluationRecord,
        };
      },

      async upsertProjectRubric(projectId, criterion, description, maxPoints, caller) {
        const client = caller.role === 'admin' ? admin() : asUser(caller.token);
        const { error } = await client.from('project_rubrics').upsert(
          { project_id: projectId, criterion, description, max_points: maxPoints },
          { onConflict: 'project_id,criterion' },
        );
        if (error) throw new ApiError(403, 'forbidden', 'Not authorized to edit rubric for this project.');
      },

      async listCertificateTemplates(): Promise<CertificateTemplateRecord[]> {
        const { data } = await admin().from('certificate_templates').select('*').eq('active', true);
        return ((data ?? []) as Record<string, unknown>[]).map((t) => ({
          id: String(t.id),
          title: String(t.title),
          skillId: String(t.skill_id),
          courseId: String(t.course_id),
          projectId: String(t.project_id),
          passMark: Number(t.pass_mark ?? 70),
        }));
      },

      async listUserCertificates(userId, caller) {
        const { data } = await asUser(caller.token).from('issued_certificates').select('*').eq('user_id', userId);
        return ((data ?? []) as Record<string, unknown>[]).map(mapCertificate);
      },

      async getIssuedCertificateByCode(code) {
        const { data } = await admin().from('issued_certificates').select('*').eq('verification_code', code).maybeSingle();
        return data ? mapCertificate(data as Record<string, unknown>) : null;
      },

      async saveIssuedCertificate(cert) {
        const { data, error } = await admin()
          .from('issued_certificates')
          .insert({
            verification_code: cert.verificationCode,
            template_id: cert.templateId,
            user_id: cert.userId,
            holder_name: cert.holderName,
            title: cert.title,
            skill_name: cert.skillName,
            status: cert.status,
            issued_at: cert.issuedAt,
            issued_by: cert.issuedBy,
            signature_alg: cert.signatureAlg,
            signature_payload: cert.signaturePayload,
            signature_hex: cert.signatureHex,
          })
          .select('*')
          .single();
        if (error || !data) throw new ApiError(409, 'certificate_exists', 'Certificate already issued or could not be created.');
        await admin().from('certificate_audit_log').insert({
          certificate_id: data.id,
          action: 'issued',
          actor_id: cert.issuedBy,
          details: { templateId: cert.templateId, verificationCode: cert.verificationCode },
        });
        return mapCertificate(data as Record<string, unknown>);
      },

      async revokeCertificate(certId, actorId, reason) {
        const now = new Date().toISOString();
        const { data, error } = await admin()
          .from('issued_certificates')
          .update({ status: 'revoked', revoked_at: now, revoked_by: actorId, revocation_reason: reason })
          .eq('id', certId)
          .select('*')
          .single();
        if (error || !data) throw new ApiError(404, 'certificate_not_found', 'Certificate not found.');
        await admin().from('certificate_audit_log').insert({
          certificate_id: certId,
          action: 'revoked',
          actor_id: actorId,
          details: { reason },
        });
        return mapCertificate(data as Record<string, unknown>);
      },

      async logCertificateVerification(input) {
        await admin().from('certificate_verifications').insert({
          certificate_id: input.certificateId,
          verification_code: input.verificationCode,
          outcome: input.outcome,
          client_hash: input.clientHash,
        });
      },

      async listNotifications(userId): Promise<NotificationRecord[]> {
        const { data } = await admin().from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(25);
        return ((data ?? []) as Record<string, unknown>[]).map((n) => ({
          id: String(n.id),
          text: String(n.text),
          to: String(n.link_to ?? '/dashboard'),
          read: Boolean(n.read),
          at: new Date(String(n.created_at)).getTime(),
        }));
      },

      async pushNotification(userId, dedupeKey, text, linkTo) {
        await admin().from('notifications').upsert(
          { user_id: userId, dedupe_key: dedupeKey, text, link_to: linkTo, read: false },
          { onConflict: 'user_id,dedupe_key' },
        );
      },

      async markNotificationsRead(userId) {
        await admin().from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
      },

      async listAuditLogs(caller, limit = 100) {
        if (caller.role !== 'admin') throw new ApiError(403, 'forbidden', 'Administrator access required.');
        const { data } = await admin().from('security_audit_logs').select('*').order('created_at', { ascending: false }).limit(limit);
        return (data ?? []) as Record<string, unknown>[];
      },

      async isInstructorForProject(instructorId, projectId) {
        const [{ data: proj }, { data: assign }] = await Promise.all([
          admin().from('projects').select('instructor_id').eq('id', projectId).maybeSingle(),
          admin().from('instructor_assignments').select('id').eq('instructor_id', instructorId).eq('scope_type', 'project').eq('scope_id', projectId).maybeSingle(),
        ]);
        return proj?.instructor_id === instructorId || Boolean(assign);
      },
    },
  };
}
