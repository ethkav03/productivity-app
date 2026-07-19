'use client';

import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';
import { Sparkles, Trophy, Zap } from 'lucide-react';
import clsx from 'clsx';

export type ToastVariant = 'default' | 'xp' | 'levelup' | 'achievement';

export interface ToastInput {
  title: string;
  description?: string;
  variant?: ToastVariant;
}

interface Toast extends ToastInput {
  id: string;
}

interface ToastContextValue {
  toasts: Toast[];
  push: (toast: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const VARIANT_STYLES: Record<ToastVariant, string> = {
  default: 'border-border bg-surface',
  xp: 'border-accent/40 bg-surface',
  levelup: 'border-primary/50 bg-primary/10 shadow-glow',
  achievement: 'border-accent/50 bg-accent/10 shadow-glow',
};

const VARIANT_ICON: Record<ToastVariant, ReactNode> = {
  default: null,
  xp: <Zap className="h-5 w-5 text-accent" />,
  levelup: <Sparkles className="h-5 w-5 text-primary" />,
  achievement: <Trophy className="h-5 w-5 text-accent" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((toast: ToastInput) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((current) => [...current, { ...toast, id }]);
    setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const value = useMemo(() => ({ toasts, push }), [toasts, push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4 sm:items-end sm:right-4 sm:left-auto">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={clsx(
              'pointer-events-auto w-full max-w-sm animate-pop-in rounded-xl border px-4 py-3 backdrop-blur',
              VARIANT_STYLES[toast.variant ?? 'default'],
            )}
          >
            <div className="flex items-start gap-2.5">
              {VARIANT_ICON[toast.variant ?? 'default']}
              <div>
                <p className="text-sm font-semibold text-foreground">{toast.title}</p>
                {toast.description && <p className="mt-0.5 text-xs text-muted">{toast.description}</p>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
