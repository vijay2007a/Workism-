import { createContext, use, useCallback, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

type Tone = 'good' | 'info' | 'bad';
interface Toast { id: number; text: string; tone: Tone }

const Ctx = createContext<(text: string, tone?: Tone) => void>(() => {});
export const useToast = () => use(Ctx);

const ICON = {
  good: <CircleCheck className="size-5 flex-none text-good" aria-hidden />,
  info: <Info className="size-5 flex-none text-violet" aria-hidden />,
  bad: <CircleAlert className="size-5 flex-none text-bad" aria-hidden />,
};
let nextId = 0;

export function GlassToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((text: string, tone: Tone = 'good') => {
    const id = nextId++;
    setToasts((l) => [...l.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((l) => l.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <Ctx value={show}>
      {children}
      <div role="status" className="pointer-events-none fixed inset-x-4 bottom-28 z-[70] flex flex-col items-center gap-2 tab:bottom-8">
        <AnimatePresence>
          {toasts.map((x) => (
            <motion.div
              key={x.id}
              layout
              className="lg-float lg-edge flex max-w-md items-center gap-3 rounded-[1.6rem] px-5 py-3 text-[0.9375rem] font-medium"
              initial={{ opacity: 0, y: 30, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.94, transition: { duration: 0.18 } }}
              transition={{ type: 'spring', stiffness: 400, damping: 22 }}
            >
              {ICON[x.tone]}
              {x.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx>
  );
}
