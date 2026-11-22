import { readEnv, type ServerEnv } from './env.ts';
import { authWorkspaceRoutes } from './routes/auth-workspace.ts';
import { projectsCertsRoutes } from './routes/projects-certs.ts';
import { skillsLearningRoutes } from './routes/skills-learning.ts';
import { staffRoutes } from './routes/staff.ts';
import { clientIpHash, type RouteDef } from './router-utils.ts';
import { ApiError, corsHeaders, errorResponse, SECURITY_HEADERS } from './security.ts';
import { createSupabaseRuntime } from './supabase-runtime.ts';
import type { BackendRuntime } from './types.ts';

interface CompiledRoute {
  method: string;
  segments: string[];
  staticCount: number;
  handler: RouteDef['handler'];
}

function compileRoutes(defs: RouteDef[]): CompiledRoute[] {
  return defs
    .map((d) => {
      const segments = d.pattern.split('/').filter(Boolean);
      const staticCount = segments.filter((s) => !s.startsWith(':')).length;
      return { method: d.method.toUpperCase(), segments, staticCount, handler: d.handler };
    })
    // Prefer static segments over dynamic params for routes of equal length.
    .sort((a, b) => b.staticCount - a.staticCount);
}

const ROUTES = compileRoutes([
  ...authWorkspaceRoutes,
  ...skillsLearningRoutes,
  ...projectsCertsRoutes,
  ...staffRoutes,
]);

function matchRoute(method: string, pathname: string): { route: CompiledRoute; params: Record<string, string> } | null {
  const pathSegs = pathname.split('/').filter(Boolean);
  for (const route of ROUTES) {
    if (route.method !== method || route.segments.length !== pathSegs.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < route.segments.length; i++) {
      const pat = route.segments[i];
      const seg = pathSegs[i];
      if (pat.startsWith(':')) {
        params[pat.slice(1)] = decodeURIComponent(seg);
      } else if (pat !== seg) {
        ok = false;
        break;
      }
    }
    if (ok) return { route, params };
  }
  return null;
}

export function createApp(runtime?: BackendRuntime, env: ServerEnv = readEnv()) {
  const rt = runtime ?? createSupabaseRuntime(env);

  async function fetch(req: Request): Promise<Response> {
    const cors = corsHeaders(req, env.allowedOrigins);
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...SECURITY_HEADERS, ...cors } });
    }

    try {
      const url = new URL(req.url);
      // Normalize trailing slash (except root)
      const pathname = url.pathname.length > 1 && url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;
      const matched = matchRoute(req.method.toUpperCase(), pathname);
      if (!matched) {
        throw new ApiError(404, 'not_found', 'Endpoint not found.');
      }
      return await matched.route.handler({
        req,
        url,
        params: matched.params,
        runtime: rt,
        env,
        ipHash: clientIpHash(req),
        headers: cors,
      });
    } catch (err) {
      return errorResponse(err, cors);
    }
  }

  return { fetch };
}
