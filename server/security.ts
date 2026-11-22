import { createHash } from 'node:crypto';
import type { ZodType } from 'zod';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'Cache-Control': 'no-store',
};

export function corsHeaders(req: Request, allowedOrigins: readonly string[]): Record<string, string> {
  const origin = req.headers.get('origin');
  if (!origin) return {};
  const requestOrigin = new URL(req.url).origin;
  if (origin === requestOrigin || allowedOrigins.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      Vary: 'Origin',
    };
  }
  return { Vary: 'Origin' };
}

export function jsonResponse(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...SECURITY_HEADERS,
      ...extraHeaders,
    },
  });
}

export function errorResponse(err: unknown, extraHeaders: Record<string, string> = {}): Response {
  if (err instanceof ApiError) {
    return jsonResponse(
      { error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } },
      err.status,
      extraHeaders,
    );
  }
  // Never expose stack traces, DB credentials, or internal errors to callers.
  return jsonResponse(
    { error: { code: 'internal_error', message: 'An unexpected error occurred.' } },
    500,
    extraHeaders,
  );
}

export async function parseJsonBody<T>(req: Request, schema: ZodType<T>, maxBytes = 65_536): Promise<T> {
  const lenHeader = req.headers.get('content-length');
  if (lenHeader && Number(lenHeader) > maxBytes) {
    throw new ApiError(413, 'payload_too_large', 'Request payload exceeds the size limit.');
  }
  const chunks: Uint8Array[] = [];
  const reader = req.body?.getReader();
  let size = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          throw new ApiError(413, 'payload_too_large', 'Request payload exceeds the size limit.');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    throw new ApiError(400, 'invalid_json', 'Request body must be valid JSON.');
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new ApiError(400, 'validation_error', 'Input validation failed.', {
      issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  return result.data;
}

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.get('authorization') ?? '';
  const match = /^Bearer\s+([^\s]+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

export function hashIdentifier(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

/** Only allows relative in-app paths or exact allowlisted origins (blocks open redirects). */
export function isSafeRedirectUrl(target: string, allowedOrigins: readonly string[]): boolean {
  const trimmed = target.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes('\\')) return true;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    return allowedOrigins.includes(parsed.origin);
  } catch {
    return false;
  }
}

/** Strict GitHub repository URL check (blocks SSRF, credentials-in-URL, non-GitHub hosts). */
export function isSafeGithubRepoUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!/^https:\/\/github\.com\/[A-Za-z0-9_-]{1,39}\/[A-Za-z0-9._-]{1,100}\/?$/.test(trimmed)) return false;
  try {
    const u = new URL(trimmed);
    if (u.username || u.password || u.search || u.hash || u.hostname !== 'github.com') return false;
    const parts = u.pathname.split('/').filter(Boolean);
    return parts.length === 2 && !parts.includes('..') && !parts.includes('.');
  } catch {
    return false;
  }
}
