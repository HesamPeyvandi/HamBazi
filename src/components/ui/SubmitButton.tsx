'use client';
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type MouseEvent } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';

/** Spinning circle shown next to the label of a busy button. Inherits the text color. */
export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 className={`h-4 w-4 shrink-0 animate-spin ${className}`} aria-hidden data-testid="spinner" />;
}

/**
 * Forms that are being submitted. A form is locked synchronously on its first `submit` event, before React re-renders,
 * so a fast second click / Enter press can never start a second request (the "slot is no longer bookable" bug).
 */
let locked = new WeakSet<HTMLFormElement>();
// Restored from the back/forward cache: a form that was mid-submit when the user left must be usable again.
if (typeof window !== 'undefined') window.addEventListener('pageshow', (e) => { if (e.persisted) locked = new WeakSet(); });
const guarded = new WeakSet<HTMLFormElement>();
function guard(form: HTMLFormElement) {
  if (guarded.has(form)) return;
  guarded.add(form);
  form.addEventListener('submit', (e) => {
    if (locked.has(form)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (!e.defaultPrevented) locked.add(form);
  });
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Optional label while pending (defaults to the normal children). */
  pendingLabel?: React.ReactNode;
  /** Icon-only buttons: replace the content with the spinner while busy. */
  spinnerOnly?: boolean;
};

/**
 * Submit button for server-action forms: after one press it is disabled, marked aria-busy and shows a spinner
 * next to its text until the action finishes. Works with `formAction` buttons too (only the pressed one shows the spinner).
 */
export function SubmitButton({ children, pendingLabel, spinnerOnly, disabled, onClick, className, type = 'submit', ...rest }: Props) {
  const { pending } = useFormStatus();
  const ref = useRef<HTMLButtonElement>(null);
  const [mine, setMine] = useState(false);
  const was = useRef(false);

  useEffect(() => { if (ref.current?.form) guard(ref.current.form); }, []);
  useEffect(() => {
    if (was.current && !pending) { if (ref.current?.form) locked.delete(ref.current.form); setMine(false); }
    was.current = pending;
  }, [pending]);

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    const form = e.currentTarget.form;
    if ((form && locked.has(form)) || pending) { e.preventDefault(); return; }
    onClick?.(e);
    if (!e.defaultPrevented) setMine(true);
  };
  const busy = pending && mine;
  return (
    <button ref={ref} type={type} {...rest} className={className} onClick={handleClick}
      disabled={disabled || pending} aria-busy={busy || undefined} data-pending={busy ? 'true' : undefined}>
      {busy && <Spinner />}
      {busy && spinnerOnly ? null : busy && pendingLabel ? pendingLabel : children}
    </button>
  );
}
