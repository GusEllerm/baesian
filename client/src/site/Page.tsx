import { type ReactNode, useEffect, useRef, useState } from "react";
import { sentence } from "../proof";
import { follow } from "./nav";

// The frame every page of the website shares (M9e): the client's own header, then the page on a card-coloured sheet in
// the middle of the desk. Round 5's type, colours and spacing (client/src/style.css), nothing new.

export function Shell({ who, children, wide }: { who?: string | undefined; children: ReactNode; wide?: boolean }) {
  return (
    <>
      <header className="bar">
        <a className="wordmark" href="/" onClick={follow("/")}>
          Baesian
        </a>
        <p className="summary who">{who && <>Signed in as <b>{who}</b></>}</p>
        <nav className="site-nav" aria-label="The site">
          {who ? (
            <>
              <a href="/" onClick={follow("/")}>
                Projects
              </a>
              <a href="/account" onClick={follow("/account")}>
                Account
              </a>
            </>
          ) : (
            <a href="/sign-in" onClick={follow("/sign-in")}>
              Sign in
            </a>
          )}
        </nav>
      </header>
      <main className="site-main">
        <div className={wide ? "site-page wide" : "site-page"}>{children}</div>
      </main>
    </>
  );
}

/** One sheet of a page: its title, and what it says. A page's first is its heading; `sub` makes one a section of it. */
export function Sheet({ title, lead, children, label, sub }: { title: string; lead?: ReactNode; children?: ReactNode; label?: string; sub?: boolean }) {
  return (
    <section className="site-sheet" aria-label={label ?? title}>
      {sub ? <h2>{title}</h2> : <h1>{title}</h1>}
      {lead && <p className="lead">{lead}</p>}
      {children}
    </section>
  );
}

/** What went wrong, as a sentence, read out when it appears. */
export function Problem({ text }: { text: string | undefined }) {
  if (!text) return null;
  return (
    <p className="problem site-problem" role="alert">
      {sentence(text)}
    </p>
  );
}

/** Something that went right, read out when it appears. */
export function Notice({ text }: { text: string | undefined }) {
  if (!text) return null;
  return (
    <p className="site-notice" role="status">
      {text}
    </p>
  );
}

/** A labelled field, with a hint under its label. */
export function Field(p: {
  label: string;
  hint?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  inputMode?: "numeric" | "email" | "text";
  name?: string;
  autoFocus?: boolean;
  maxLength?: number;
  mono?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (p.autoFocus) ref.current?.focus();
  }, [p.autoFocus]);
  return (
    <label className="site-field">
      <span className="lbl">{p.label}</span>
      {p.hint && <span className="hint">{p.hint}</span>}
      <input
        ref={ref}
        className={p.mono ? "mono" : undefined}
        type={p.type ?? "text"}
        name={p.name}
        value={p.value}
        autoComplete={p.autoComplete}
        inputMode={p.inputMode}
        maxLength={p.maxLength}
        spellCheck={false}
        autoCapitalize="off"
        onChange={(e) => p.onChange(e.target.value)}
      />
    </label>
  );
}

/**
 * Something shown exactly once (M9c): the recovery code, or the line CI pins for a passkey (D159). It's in a box you can
 * select, with a button that copies it, and says it won't be shown again.
 */
export function ShownOnce({ label, value, why, mono }: { label: string; value: string; why: ReactNode; mono?: "big" | "line" }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="shown-once">
      <span className="lbl">{label}</span>
      <p className="hint">{why}</p>
      <div className="once-row">
        <code className={mono === "big" ? "once big" : "once"} aria-label={label}>
          {value}
        </code>
        <button type="button" className="switch" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

/** A primary action, busy while it runs. */
export function Go({ children, busy, disabled, onClick, busyText }: { children: ReactNode; busy?: boolean; disabled?: boolean; onClick: () => void; busyText?: string }) {
  return (
    <button type="button" className="confirm site-go" disabled={disabled || busy} aria-busy={busy || undefined} onClick={onClick}>
      {busy ? (busyText ?? "One moment…") : children}
    </button>
  );
}

/** A link to one of the site's pages, kept in the app. */
export function To({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  return (
    <a href={to} className={className ?? "link"} onClick={follow(to)}>
      {children}
    </a>
  );
}
