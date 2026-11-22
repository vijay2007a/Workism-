export interface CodeTest { args: unknown[]; expected: unknown }
export interface TestResult { ok: boolean; got: string }
export interface Outcome { results?: TestResult[]; error?: string }

/** Order-insensitive JSON, so { a, b } equals { b, a }. */
const STABLE = `const stable = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x)) ?? String(v);`;

const workerSource = (code: string, fn: string, tests: readonly CodeTest[]) => `
${STABLE}
try {
  const run = new Function(${JSON.stringify(`${code}\n;return typeof ${fn} === 'function' ? ${fn} : undefined;`)})();
  if (!run) throw new Error(${JSON.stringify(`Define a function named ${fn}.`)});
  postMessage({ results: ${JSON.stringify(tests)}.map((t) => {
    try {
      const got = stable(run(...t.args));
      return { ok: got === stable(t.expected), got };
    } catch (e) {
      return { ok: false, got: String(e) };
    }
  }) });
} catch (e) {
  postMessage({ error: String(e) });
}`;

/** The sandbox can post anything, so only a well-formed answer is believed. */
export function readOutcome(data: unknown, count: number): Outcome {
  const { results, error } = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  if (Array.isArray(results) && results.length === count) return { results: results.map((r) => ({ ok: r?.ok === true, got: String(r?.got) })) };
  return { error: typeof error === 'string' ? error : 'The code did not return a result.' };
}

/**
 * Runs JavaScript in a worker inside a sandboxed frame: an opaque origin with no network, so learner code cannot reach
 * this site's storage, session or page. A time limit stops endless loops without freezing anything.
 */
export function runJs(code: string, fn: string, tests: readonly CodeTest[], limit = 2500): Promise<Outcome> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    const finish = (outcome: Outcome) => {
      clearTimeout(timer);
      removeEventListener('message', onMessage);
      frame.remove(); // takes the worker with it
      resolve(outcome);
    };
    const onMessage = (e: MessageEvent) => e.source === frame.contentWindow && finish(readOutcome(e.data, tests.length));
    const timer = setTimeout(() => finish({ error: 'Stopped: your code ran for too long. Look for a loop that never ends.' }), limit);
    addEventListener('message', onMessage);
    frame.hidden = true;
    frame.sandbox.add('allow-scripts');
    frame.srcdoc = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:"><script>
const w = new Worker(URL.createObjectURL(new Blob([${JSON.stringify(workerSource(code, fn, tests)).replaceAll('<', '\\u003c')}], { type: 'text/javascript' })));
w.onmessage = (e) => parent.postMessage(e.data, '*');
w.onerror = (e) => parent.postMessage({ error: e.message }, '*');
</script>`;
    document.body.append(frame);
  });
}
