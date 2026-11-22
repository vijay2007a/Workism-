import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, Copy, RotateCcw, Send, Sparkles, Trash2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { GUIDE } from '../data/guide';
import { LiquidGlassButton } from '../glass/LiquidGlassButton';
import { useRefraction } from '../glass/refraction';
import { cn } from '../lib/cn';
import { useCalm } from '../lib/effects';
import { useI18n } from '../lib/i18n';
import { api, connected, NotConnected, type ChatMessage } from '../services';

interface Entry extends ChatMessage { id: number; error?: boolean; guide?: boolean; fresh?: boolean }

interface Chat { entries: Entry[]; busy: boolean; send: (text: string) => void; retry: () => void; clear: () => void }
const Ctx = createContext<Chat>({ entries: [], busy: false, send: () => {}, retry: () => {}, clear: () => {} });

let nextId = 0;

/** One conversation, shared by the floating panel and the assistant page. Kept in memory only. */
export function AssistantProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);

  const answer = useCallback(
    async (history: Entry[]) => {
      setBusy(true);
      const asked = history.at(-1)!.text;
      const guide = connected ? undefined : GUIDE.find((g) => t(g.prompt) === asked || g.prompt === asked);
      let reply: Omit<Entry, 'id' | 'role'>;
      try {
        if (guide) {
          await new Promise((r) => setTimeout(r, 650));
          reply = { text: guide.answer, guide: true, fresh: true };
        } else {
          reply = { ...(await api.ask(history.filter((e) => !e.error).map(({ role, text }) => ({ role, text })))), fresh: true };
        }
      } catch (e) {
        reply = {
          error: true,
          text:
            e instanceof NotConnected
              ? t('The assistant service is not connected yet, so only the suggested questions have answers.')
              : t('The assistant did not answer. Check your connection and try again.'),
        };
      }
      setEntries((l) => [...l, { ...reply, id: nextId++, role: 'assistant' }]);
      setBusy(false);
    },
    [t],
  );

  const chat = useMemo<Chat>(
    () => ({
      entries,
      busy,
      send(text) {
        const next = [...entries.map((e) => ({ ...e, fresh: false })), { id: nextId++, role: 'user' as const, text }];
        setEntries(next);
        void answer(next);
      },
      retry() {
        const next = entries.slice(0, -1);
        setEntries(next);
        void answer(next);
      },
      clear: () => setEntries([]),
    }),
    [entries, busy, answer],
  );
  return <Ctx value={chat}>{children}</Ctx>;
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const copy = () =>
    navigator.clipboard.writeText(code).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      },
      () => {},
    );
  return (
    <div className="lg-code" dir="ltr">
      <div className="flex items-center justify-between ps-4 pe-2 pt-2 text-xs text-[#d8d2f4]">
        {lang || t('Code')}
        <button type="button" className="inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 hover:bg-white/15" onClick={copy}>
          {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          <span aria-live="polite">{copied ? t('Copied') : t('Copy')}</span>
        </button>
      </div>
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable regions must be reachable by keyboard */}
      <pre tabIndex={0}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** Text with ``` fences. Rendered as React text, never as HTML. */
export function RichText({ text }: { text: string }) {
  return text.split(/```(\w*)\n([\s\S]*?)(?:```|$)/).map((part, i, all) => {
    if (i % 3 === 1) return null;
    if (i % 3 === 2) return <CodeBlock key={i} code={part.trimEnd()} lang={all[i - 1]} />;
    return part.trim() && (
      <p key={i} className="whitespace-pre-line">
        {part.trim()}
      </p>
    );
  });
}

/** Reveals a new reply a few characters at a time. */
function Typed({ text, onTick }: { text: string; onTick: () => void }) {
  const [n, setN] = useState(0);
  const tick = useRef(onTick);
  useEffect(() => {
    tick.current = onTick;
  });
  useEffect(() => {
    const id = setInterval(() => {
      setN((v) => {
        if (v >= text.length) clearInterval(id);
        return v + 4;
      });
      tick.current();
    }, 16);
    return () => clearInterval(id);
  }, [text]);
  if (n >= text.length) return <RichText text={text} />;
  return (
    <>
      <span className="sr-only">{text}</span>
      <div aria-hidden inert>
        <RichText text={text.slice(0, n)} />
      </div>
    </>
  );
}

export function AIAssistantPanel({ className }: { className?: string }) {
  const { t } = useI18n();
  const { entries, busy, send, retry, clear } = use(Ctx);
  const calm = useCalm();
  const [draft, setDraft] = useState('');
  const log = useRef<HTMLDivElement>(null);

  const toEnd = useCallback(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);
  useEffect(toEnd, [entries, busy, toEnd]);

  const submit = () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    send(text);
  };

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div ref={log} role="log" aria-label={t('Conversation')} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-1 pb-3">
        {entries.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-4 pt-6 pb-2 text-center">
            <span className="lg-orb floaty size-16" style={{ ['--orb' as string]: '#a679ff' }}>
              <Sparkles className="size-7" aria-hidden />
            </span>
            <p className="text-lg font-semibold">{t('Ask about your skills, lessons or projects.')}</p>
            {!connected && <p className="text-sm text-ink-soft">{t('Suggested questions have written answers. Anything else needs the assistant service.')}</p>}
          </div>
        )}
        {entries.map((e, i) => (
          <motion.div
            key={e.id}
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 380, damping: 24 }}
            className={cn('lg-bubble', e.role === 'user' ? 'lg-bubble-me' : 'lg-bubble-ai', e.error && 'lg-bubble-error')}
            role={e.error ? 'alert' : undefined}
          >
            {e.fresh && !calm && i === entries.length - 1 ? <Typed text={e.text} onTick={toEnd} /> : <RichText text={e.text} />}
            {e.guide && <p className="mt-2 text-xs text-ink-soft">{t('Written answer from the built-in guide')}</p>}
            {e.error && i === entries.length - 1 && (
              <LiquidGlassButton size="sm" className="mt-3" icon={<RotateCcw aria-hidden />} onClick={retry}>
                {t('Try again')}
              </LiquidGlassButton>
            )}
          </motion.div>
        ))}
        {busy && (
          <div className="lg-bubble lg-bubble-ai lg-typing" role="status" aria-label={t('Writing a reply')}>
            <i />
            <i />
            <i />
          </div>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto px-1 pt-2 pb-3 [scrollbar-width:none]">
        {GUIDE.map((g) => (
          <button key={g.prompt} type="button" className="lg-chip min-h-9 flex-none px-4 hover:brightness-105" disabled={busy} onClick={() => send(t(g.prompt))}>
            {t(g.prompt)}
          </button>
        ))}
      </div>

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="lg-field min-w-0 flex-1 py-2.5!">
          <textarea
            rows={1}
            aria-label={t('Message')}
            placeholder={t('Ask anything…')}
            className="field-sizing-content max-h-32 resize-none"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
          />
        </div>
        {entries.length > 0 && <LiquidGlassButton variant="icon" aria-label={t('Clear conversation')} icon={<Trash2 aria-hidden />} onClick={clear} disabled={busy} />}
        <LiquidGlassButton variant="primary" type="submit" className="size-12 min-h-12 p-0" aria-label={t('Send')} icon={<Send className="rtl:-scale-x-100" aria-hidden />} disabled={!draft.trim()} loading={busy} />
      </form>
    </div>
  );
}

/** The same conversation, floating over any page. */
export function FloatingAssistant({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <AnimatePresence>{open && <FloatingSheet onClose={onClose} />}</AnimatePresence>;
}

function FloatingSheet({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLElement>(null);
  const refraction = useRefraction(ref);
  useEffect(() => {
    ref.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <motion.aside
      ref={ref}
      tabIndex={-1}
      aria-label={t('AI Assistant')}
      className="lg-float lg-edge fixed end-6 bottom-6 z-50 flex h-[min(40rem,calc(100dvh-3rem))] w-[26rem] flex-col p-4 outline-none"
      style={{ transformOrigin: 'bottom right' }}
      initial={{ opacity: 0, y: 40, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 24, scale: 0.95, transition: { duration: 0.16 } }}
      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
    >
      {refraction}
      <header className="flex items-center justify-between gap-3 px-2 pb-2">
        <h2 className="flex items-center gap-2.5 text-lg font-bold">
          <Sparkles className="size-5 text-violet" aria-hidden />
          {t('AI Assistant')}
        </h2>
        <LiquidGlassButton variant="icon" size="sm" aria-label={t('Close')} icon={<X aria-hidden />} onClick={onClose} />
      </header>
      <AIAssistantPanel className="flex-1" />
    </motion.aside>
  );
}
