import type { ServerEnv } from './env.ts';
import type { CodeExecutionResult } from './types.ts';

const MAX_CODE_BYTES = 32_768;
const SANDBOX_TIMEOUT_MS = 6_000;
const MAX_OUTPUT_CHARS = 4_000;

/**
 * External isolated code execution adapter.
 * NEVER executes untrusted student code in Vercel Functions or the primary backend process.
 * Never simulates passed tests when the sandbox service is unavailable.
 */
export function createSandboxRunner(env: ServerEnv) {
  return {
    async execute(input: {
      languageId: string;
      runtime: string | null;
      code: string;
      fnName: string;
      tests: { args: unknown[]; expected: unknown }[];
    }): Promise<CodeExecutionResult> {
      if (Buffer.byteLength(input.code, 'utf8') > MAX_CODE_BYTES) {
        return { status: 'failed', simulated: false, error: 'Submitted code exceeds the 32 KB size limit.' };
      }
      if (!env.codeExecutionUrl) {
        return {
          status: 'unavailable',
          simulated: false,
          error: `Remote execution sandbox is not configured for ${input.languageId}. Tests were not executed or simulated.`,
        };
      }
      if (!input.runtime) {
        return {
          status: 'unavailable',
          simulated: false,
          error: `No isolated execution runtime is configured for ${input.languageId}.`,
        };
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), SANDBOX_TIMEOUT_MS);
      try {
        const res = await fetch(env.codeExecutionUrl, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            ...(env.codeExecutionToken ? { Authorization: `Bearer ${env.codeExecutionToken}` } : {}),
          },
          body: JSON.stringify({
            language: input.languageId,
            runtime: input.runtime,
            code: input.code,
            fnName: input.fnName,
            tests: input.tests,
            limits: {
              timeoutMs: 3_000,
              memoryMb: 128,
              cpus: 0.5,
              networkDisabled: true,
              readOnlyRootFs: true,
              maxProcesses: 16,
              maxOutputBytes: MAX_OUTPUT_CHARS,
            },
          }),
        });
        clearTimeout(timer);
        if (!res.ok) {
          return {
            status: 'unavailable',
            simulated: false,
            error: `Isolated execution provider responded with HTTP ${res.status}.`,
          };
        }
        const payload = (await res.json()) as {
          results?: { ok: boolean; got: string }[];
          runtimeMs?: number;
          stdout?: string;
          error?: string;
        };
        if (Array.isArray(payload.results) && payload.results.length === input.tests.length) {
          return {
            status: 'completed',
            simulated: false,
            results: payload.results.map((r) => ({
              ok: r.ok === true,
              got: String(r.got ?? '').slice(0, 500),
            })),
            runtimeMs: typeof payload.runtimeMs === 'number' ? payload.runtimeMs : undefined,
            stdout: typeof payload.stdout === 'string' ? payload.stdout.slice(0, MAX_OUTPUT_CHARS) : undefined,
          };
        }
        return {
          status: 'failed',
          simulated: false,
          error: typeof payload.error === 'string' ? payload.error.slice(0, 500) : 'Execution provider returned an unexpected response.',
        };
      } catch {
        clearTimeout(timer);
        return {
          status: 'unavailable',
          simulated: false,
          error: 'Isolated execution service timed out or could not be reached.',
        };
      }
    },
  };
}
