'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';

export interface ConfirmOptions {
  title: string;
  /** What will happen, in plain words. */
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" makes the confirm button red and puts focus on Cancel, so Enter can't destroy anything by accident. */
  tone?: 'default' | 'danger';
}

export interface ReasonOptions extends ConfirmOptions {
  /** The label above the text box, e.g. "Why are you suspending this account?" */
  reasonLabel: string;
  /** Fewest characters accepted. Default 5. */
  minLength?: number;
  /** A reason is optional when true: an empty box is allowed. */
  optional?: boolean;
}

type Ask = (options: ConfirmOptions) => Promise<boolean>;
type AskReason = (options: ReasonOptions) => Promise<string | null>;

const ConfirmContext = React.createContext<Ask>(() => Promise.resolve(false));
const ReasonContext = React.createContext<AskReason>(() => Promise.resolve(null));

/** Ask the person to confirm. Resolves true on confirm; false on cancel, Esc or a click outside. */
export const useConfirm = () => React.useContext(ConfirmContext);

/** Like useConfirm, but also asks for a written reason. Resolves with the reason (trimmed), or null if they cancelled. */
export const useAskReason = () => React.useContext(ReasonContext);

interface Pending {
  options: ConfirmOptions;
  reason?: { label: string; min: number; optional: boolean };
  resolve: (value: boolean, reason?: string) => void;
}

/**
 * A real dialog instead of the browser's native confirm box: styled to match, keyboard and screen-reader friendly
 * (the platform's <dialog> traps focus and closes on Esc), and it says what will happen in the button itself.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<Pending | null>(null);
  const [reason, setReason] = React.useState('');
  const dialog = React.useRef<HTMLDialogElement>(null);
  const titleId = React.useId();
  const messageId = React.useId();
  const reasonId = React.useId();

  const ask = React.useCallback<Ask>((options) => new Promise<boolean>((resolve) => { setReason(''); setPending({ options, resolve: (v) => resolve(v) }); }), []);
  const askReason = React.useCallback<AskReason>(
    (options) =>
      new Promise<string | null>((resolve) => {
        setReason('');
        setPending({ options, reason: { label: options.reasonLabel, min: options.minLength ?? 5, optional: !!options.optional }, resolve: (ok, text) => resolve(ok ? (text ?? '') : null) });
      }),
    [],
  );

  React.useEffect(() => {
    const el = dialog.current;
    if (pending && el && !el.open) {
      el.showModal();
      // showModal() focuses the first button; say which one should have it.
      const target = pending.reason ? `#${CSS.escape(reasonId)}` : pending.options.tone === 'danger' ? '[data-confirm=cancel]' : '[data-confirm=accept]';
      el.querySelector<HTMLElement>(target)?.focus();
    }
  }, [pending, reasonId]);

  const settle = (value: boolean) => {
    pending?.resolve(value, reason.trim());
    dialog.current?.close();
    setPending(null);
  };

  const tone = pending?.options.tone ?? 'default';
  const tooShort = !!pending?.reason && !pending.reason.optional && reason.trim().length < pending.reason.min;

  return (
    <ConfirmContext.Provider value={ask}>
      <ReasonContext.Provider value={askReason}>
        {children}
        {pending && (
          <dialog
            ref={dialog}
            aria-labelledby={titleId}
            aria-describedby={messageId}
            onCancel={(e) => {
              e.preventDefault();
              settle(false);
            }}
            onClick={(e) => e.target === dialog.current && settle(false)}
            className="animate-fade-up m-auto w-[min(92vw,28rem)] py-0 text-ink border-t border-line"
          >
            <form
              className="p-6 sm:p-7"
              onSubmit={(e) => {
                e.preventDefault();
                if (!tooShort) settle(true);
              }}
            >
              <h2 id={titleId} className="font-display text-2xl font-medium leading-tight">
                {pending.options.title}
              </h2>
              <p id={messageId} className="mt-3 text-[15px] leading-relaxed text-ink-soft">
                {pending.options.message}
              </p>
              {pending.reason && (
                <div className="mt-4">
                  <label htmlFor={reasonId} className="text-sm font-medium">
                    {pending.reason.label}
                    {pending.reason.optional && <span className="font-normal text-ink-muted"> (optional)</span>}
                  </label>
                  <textarea
                    id={reasonId}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    maxLength={300}
                    className="mt-1.5 w-full rounded-xl border border-line-strong bg-white px-3 py-2 text-[15px]"
                  />
                  {!pending.reason.optional && <p className="mt-1 text-xs text-ink-muted">At least {pending.reason.min} characters. It is kept on record.</p>}
                </div>
              )}
              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <Button type="button" variant="secondary" onClick={() => settle(false)} data-confirm="cancel">
                  {pending.options.cancelLabel ?? 'Cancel'}
                </Button>
                <Button type="submit" disabled={tooShort} data-confirm="accept" className={tone === 'danger' ? 'bg-accent-600 hover:bg-accent-600/90' : undefined}>
                  {pending.options.confirmLabel ?? 'Confirm'}
                </Button>
              </div>
            </form>
          </dialog>
        )}
      </ReasonContext.Provider>
    </ConfirmContext.Provider>
  );
}
