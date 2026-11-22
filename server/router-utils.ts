import type { ServerEnv } from './env.ts';
import { ApiError, extractBearerToken, getClientIp, hashIdentifier } from './security.ts';
import type { AuthUser, BackendRuntime, Role } from './types.ts';

export interface RouteContext {
  req: Request;
  url: URL;
  params: Record<string, string>;
  runtime: BackendRuntime;
  env: ServerEnv;
  ipHash: string;
  headers: Record<string, string>;
}

export type RouteHandler = (ctx: RouteContext) => Promise<Response>;

export interface RouteDef {
  method: string;
  pattern: string;
  handler: RouteHandler;
}

export async function requireAuth(ctx: RouteContext): Promise<AuthUser> {
  const token = extractBearerToken(ctx.req);
  if (!token) throw new ApiError(401, 'unauthorized', 'Authentication required.');
  const user = await ctx.runtime.auth.verifyToken(token);
  if (!user) throw new ApiError(401, 'unauthorized', 'Session is invalid or expired.');
  return user;
}

export async function requireRole(ctx: RouteContext, allowed: readonly Role[]): Promise<AuthUser> {
  const user = await requireAuth(ctx);
  if (!allowed.includes(user.role)) {
    await ctx.runtime.auditLog({
      actorId: user.id,
      action: 'authorization_denied',
      resourceType: 'api',
      resourceId: ctx.url.pathname,
      ipHash: ctx.ipHash,
      metadata: { role: user.role, required: allowed },
    });
    throw new ApiError(403, 'forbidden', 'You do not have permission to perform this action.');
  }
  return user;
}

export async function enforceRateLimit(
  ctx: RouteContext,
  scope: string,
  subject: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const key = `${scope}:${subject}`;
  const res = await ctx.runtime.rateLimit(key, limit, windowSeconds);
  if (!res.allowed) {
    throw new ApiError(429, 'rate_limited', 'Too many requests. Please wait and try again.', {
      resetAt: res.resetAt,
    });
  }
}

export function clientIpHash(req: Request): string {
  return hashIdentifier(getClientIp(req));
}

export function assertOwnWorkspaceQuery(url: URL, userId: string): void {
  for (const param of ['workspaceId', 'userId', 'id']) {
    const supplied = url.searchParams.get(param)?.trim();
    if (supplied && supplied !== userId) {
      throw new ApiError(403, 'forbidden', 'Cannot access another user workspace.');
    }
  }
}

export function assertOwnWorkspaceBodyIds(
  ids: { workspaceId?: string; userId?: string; id?: string },
  userId: string,
): void {
  for (const supplied of [ids.workspaceId, ids.userId, ids.id]) {
    if (supplied !== undefined && supplied !== userId) {
      throw new ApiError(403, 'forbidden', 'Cannot modify another user workspace.');
    }
  }
}
