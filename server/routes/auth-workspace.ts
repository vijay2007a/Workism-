import { z } from 'zod';
import { envCapabilities } from '../env.ts';
import { enforceRateLimit, requireAuth, type RouteDef } from '../router-utils.ts';
import { ApiError, isSafeRedirectUrl, jsonResponse, parseJsonBody } from '../security.ts';

const RegisterSchema = z.object({
  name: z.string().trim().min(1).max(60),
  email: z.string().trim().email().max(254),
  password: z
    .string()
    .min(8)
    .max(128)
    .refine((v) => /\p{L}/u.test(v) && /\d/.test(v), 'Password must contain a letter and a number.'),
  redirectTo: z.string().max(300).optional(),
}).strict(); // Rejects unknown fields such as "role": "admin"

const LoginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});

const RecoverSchema = z.object({
  email: z.string().trim().email().max(254),
  redirectTo: z.string().max(300).optional(),
});

const ResetSchema = z.object({
  password: z
    .string()
    .min(8)
    .max(128)
    .refine((v) => /\p{L}/u.test(v) && /\d/.test(v), 'Password must contain a letter and a number.'),
});

const OAuthSchema = z.object({
  redirectTo: z.string().max(300),
});

const ProfilePatchSchema = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  careerGoal: z.string().trim().max(40).optional(),
  interests: z.array(z.string().trim().max(32)).max(15).optional(),
  learningStyle: z.string().trim().max(32).optional(),
  learningPace: z.string().trim().max(32).optional(),
  preferredLanguage: z.string().trim().min(2).max(8).optional(),
  preferredCodeLanguage: z.string().trim().max(32).optional(),
  githubUsername: z.string().trim().regex(/^$|^[A-Za-z0-9-]{1,39}$/).optional(),
  portfolioSlug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{2,38}[a-z0-9]$/).nullable().optional(),
  portfolioPublic: z.boolean().optional(),
  showScoresPublic: z.boolean().optional(),
  inAppNotices: z.boolean().optional(),
}).strict(); // Strictly rejects attempts to patch "role", "id", or "email"

export const authWorkspaceRoutes: RouteDef[] = [
  {
    method: 'GET',
    pattern: '/api/health',
    async handler(ctx) {
      return jsonResponse({
        ok: true,
        service: 'workism-backend',
        version: '3.0.0',
        capabilities: envCapabilities(ctx.env),
        timestamp: new Date().toISOString(),
      }, 200, ctx.headers);
    },
  },
  {
    method: 'POST',
    pattern: '/api/auth/register',
    async handler(ctx) {
      await enforceRateLimit(ctx, 'auth:register', ctx.ipHash, 10, 600);
      const body = await parseJsonBody(ctx.req, RegisterSchema);
      if (body.redirectTo && !isSafeRedirectUrl(body.redirectTo, ctx.env.allowedOrigins)) {
        throw new ApiError(400, 'invalid_redirect', 'Redirect URL is not allowed.');
      }
      const res = await ctx.runtime.auth.register(body.name, body.email, body.password, body.redirectTo);
      await ctx.runtime.auditLog({
        actorId: res.userId,
        action: 'user_registered',
        resourceType: 'profile',
        resourceId: res.userId,
        ipHash: ctx.ipHash,
      });
      return jsonResponse({
        userId: res.userId,
        role: 'student',
        emailConfirmed: res.emailConfirmed,
        ...(res.accessToken ? { accessToken: res.accessToken, refreshToken: res.refreshToken } : {}),
      }, 201, ctx.headers);
    },
  },
  {
    method: 'POST',
    pattern: '/api/auth/login',
    async handler(ctx) {
      await enforceRateLimit(ctx, 'auth:login', ctx.ipHash, 15, 300);
      const body = await parseJsonBody(ctx.req, LoginSchema);
      const session = await ctx.runtime.auth.login(body.email, body.password);
      await ctx.runtime.auditLog({
        actorId: session.user.id,
        action: 'user_login',
        resourceType: 'session',
        ipHash: ctx.ipHash,
      });
      return jsonResponse({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        user: {
          id: session.user.id,
          email: session.user.email,
          role: session.user.role,
          displayName: session.user.displayName,
        },
      }, 200, ctx.headers);
    },
  },
  {
    method: 'POST',
    pattern: '/api/auth/logout',
    async handler(ctx) {
      const user = await requireAuth(ctx);
      await ctx.runtime.auth.logout(user.token);
      return jsonResponse({ ok: true }, 200, ctx.headers);
    },
  },
  {
    method: 'POST',
    pattern: '/api/auth/recover',
    async handler(ctx) {
      await enforceRateLimit(ctx, 'auth:recover', ctx.ipHash, 5, 600);
      const body = await parseJsonBody(ctx.req, RecoverSchema);
      const redirectTo = body.redirectTo ?? `${ctx.env.allowedOrigins[0]}/reset-password`;
      if (!isSafeRedirectUrl(redirectTo, ctx.env.allowedOrigins)) {
        throw new ApiError(400, 'invalid_redirect', 'Redirect URL is not allowed.');
      }
      try {
        await ctx.runtime.auth.recoverPassword(body.email, redirectTo);
      } catch {
        // Generic response avoids email enumeration.
      }
      return jsonResponse({ ok: true, message: 'If an account exists for that email, recovery instructions have been sent.' }, 200, ctx.headers);
    },
  },
  {
    method: 'POST',
    pattern: '/api/auth/reset',
    async handler(ctx) {
      await enforceRateLimit(ctx, 'auth:reset', ctx.ipHash, 5, 600);
      const user = await requireAuth(ctx);
      const body = await parseJsonBody(ctx.req, ResetSchema);
      await ctx.runtime.auth.resetPassword(user.token, body.password);
      await ctx.runtime.auditLog({ actorId: user.id, action: 'password_reset', resourceType: 'profile', resourceId: user.id, ipHash: ctx.ipHash });
      return jsonResponse({ ok: true }, 200, ctx.headers);
    },
  },
  {
    method: 'POST',
    pattern: '/api/auth/oauth/google',
    async handler(ctx) {
      await enforceRateLimit(ctx, 'auth:oauth', ctx.ipHash, 20, 300);
      const body = await parseJsonBody(ctx.req, OAuthSchema);
      if (!isSafeRedirectUrl(body.redirectTo, ctx.env.allowedOrigins)) {
        throw new ApiError(400, 'invalid_redirect', 'Redirect URL is not allowed.');
      }
      const url = await ctx.runtime.auth.googleOAuthUrl(body.redirectTo);
      return jsonResponse({ url }, 200, ctx.headers);
    },
  },
  {
    method: 'GET',
    pattern: '/api/auth/session',
    async handler(ctx) {
      const user = await requireAuth(ctx);
      const profile = await ctx.runtime.db.getProfile(user.id, user);
      return jsonResponse({
        user: { id: user.id, email: user.email, role: user.role, displayName: profile?.displayName ?? user.displayName },
        profile,
      }, 200, ctx.headers);
    },
  },
  {
    method: 'GET',
    pattern: '/api/me/workspace',
    async handler(ctx) {
      const user = await requireAuth(ctx);
      const [profile, skills, courses, lessonsDone, projectCatalog, submissions, templates, issuedCerts, roadmap, notifications] = await Promise.all([
        ctx.runtime.db.getProfile(user.id, user),
        ctx.runtime.db.getUserSkills(user.id, user),
        ctx.runtime.db.listCourses(),
        ctx.runtime.db.listLessonsDone(user.id, user),
        ctx.runtime.db.listProjects(),
        ctx.runtime.db.listUserProjectSubmissions(user.id, user),
        ctx.runtime.db.listCertificateTemplates(),
        ctx.runtime.db.listUserCertificates(user.id, user),
        ctx.runtime.db.getActiveRoadmap(user.id, user),
        ctx.runtime.db.listNotifications(user.id),
      ]);

      const latestByProject = new Map(submissions.map((s) => [s.projectId, s]));
      for (const s of submissions) {
        const cur = latestByProject.get(s.projectId);
        if (!cur || s.version > cur.version) latestByProject.set(s.projectId, s);
      }

      const projects = projectCatalog.map((p) => {
        const sub = latestByProject.get(p.id);
        const uiStatus = sub?.status === 'changes_requested' ? 'evaluated' : sub?.status;
        return {
          id: p.id,
          title: p.title,
          skills: p.skills,
          level: p.level,
          hours: p.hours,
          brief: p.brief,
          requirements: p.requirements,
          rubric: p.rubric.map((r) => r.criterion),
          status: uiStatus,
          score: sub?.overallScore ?? undefined,
          feedback: sub?.aiFeedback ?? undefined,
          submissionId: sub?.id,
          repoUrl: sub?.repoUrl ?? undefined,
          fileName: sub?.fileName ?? undefined,
        };
      });

      const issuedByTemplate = new Map(issuedCerts.map((c) => [c.templateId, c]));
      const certificates = templates.map((tpl) => {
        const issued = issuedByTemplate.get(tpl.id);
        return {
          id: issued?.verificationCode ?? tpl.id,
          templateId: tpl.id,
          title: tpl.title,
          skill: tpl.skillId,
          course: tpl.courseId,
          project: tpl.projectId,
          status: issued ? issued.status : ('pending' as const),
          source: 'api' as const,
          issuedAt: issued ? new Date(issued.issuedAt).getTime() : undefined,
        };
      });

      return jsonResponse({
        name: profile?.displayName || user.displayName || '',
        role: user.role,
        profile,
        skills,
        courses,
        projects,
        certificates,
        lessonsDone,
        roadmap,
        notifications,
      }, 200, ctx.headers);
    },
  },
  {
    method: 'GET',
    pattern: '/api/profile',
    async handler(ctx) {
      const user = await requireAuth(ctx);
      const profile = await ctx.runtime.db.getProfile(user.id, user);
      if (!profile) throw new ApiError(404, 'not_found', 'Profile not found.');
      return jsonResponse({ profile }, 200, ctx.headers);
    },
  },
  {
    method: 'PATCH',
    pattern: '/api/profile',
    async handler(ctx) {
      const user = await requireAuth(ctx);
      const patch = await parseJsonBody(ctx.req, ProfilePatchSchema);
      const profile = await ctx.runtime.db.updateProfile(user.id, patch, user);
      return jsonResponse({ profile }, 200, ctx.headers);
    },
  },
  {
    method: 'GET',
    pattern: '/api/notifications',
    async handler(ctx) {
      const user = await requireAuth(ctx);
      const notifications = await ctx.runtime.db.listNotifications(user.id);
      return jsonResponse({ notifications }, 200, ctx.headers);
    },
  },
  {
    method: 'POST',
    pattern: '/api/notifications/read',
    async handler(ctx) {
      const user = await requireAuth(ctx);
      await ctx.runtime.db.markNotificationsRead(user.id);
      return jsonResponse({ ok: true }, 200, ctx.headers);
    },
  },
  {
    method: 'GET',
    pattern: '/api/languages/spoken',
    async handler(ctx) {
      const languages = await ctx.runtime.db.listSpokenLanguages(false);
      return jsonResponse({ languages }, 200, ctx.headers);
    },
  },
  {
    method: 'GET',
    pattern: '/api/languages/programming',
    async handler(ctx) {
      const languages = await ctx.runtime.db.listProgrammingLanguages(false);
      return jsonResponse({ languages }, 200, ctx.headers);
    },
  },
];
