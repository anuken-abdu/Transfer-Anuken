import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { CarClass, City } from "../lib/types";
import { errText } from "../lib/format";

/* ---------- справочники ---------- */
export interface Refs { cities: City[]; classes: CarClass[] }
export const RefsCtx = createContext<Refs>({ cities: [], classes: [] });
export const useRefs = () => useContext(RefsCtx);

/* ---------- уведомления ---------- */
type Toast = { id: number; text: string; bad?: boolean };
const ToastCtx = createContext<(text: string, bad?: boolean) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastHost({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((text: string, bad = false) => {
    const id = Date.now() + Math.random();
    setList((l) => [...l, { id, text, bad }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), bad ? 6000 : 3000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {list.map((t) => <div key={t.id} className={"toast" + (t.bad ? " bad" : "")}>{t.text}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- модальное окно (на телефоне — шторка снизу) ---------- */
export function Modal({ title, onClose, children, footer, wide }: {
  title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const all = document.querySelectorAll(".overlay");
      if (all[all.length - 1] === overlay.current) onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="overlay" ref={overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={"modal" + (wide ? " wide" : "")} role="dialog" aria-modal="true" tabIndex={-1} ref={ref}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть"><Icon name="x" /></button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children, span }: { label: string; hint?: string; children: ReactNode; span?: boolean }) {
  return (
    <label className={"field" + (span ? " span" : "")}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={"badge t-" + tone}>{children}</span>;
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} role="radio" aria-checked={o.value === value}
          className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export const Spinner = () => <div className="spinner" aria-label="Загрузка" />;
export const Empty = ({ title, text, action }: { title: string; text?: string; action?: ReactNode }) => (
  <div className="empty"><p className="empty-title">{title}</p>{text && <p>{text}</p>}{action}</div>
);

/* ---------- иконки (inline SVG, без сторонних библиотек) ---------- */
const P: Record<string, string> = {
  orders: "M4 6h16M4 12h16M4 18h10",
  drivers: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0",
  tariffs: "M3 7h18v10H3zM7 12h.01M17 12h.01M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z",
  companies: "M4 21V5l8-2v18M12 9h8v12M8 8h.01M8 12h.01M8 16h.01M16 13h.01M16 17h.01M2 21h20",
  plus: "M12 5v14M5 12h14",
  x: "M6 6l12 12M18 6 6 18",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2",
  chat: "M4 5h16v11H8l-4 4z",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  plane: "M2 16l20-7-6 13-3-6-6-3z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 5 5",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11",
  car: "M5 16h14M6 16l1.5-5h9L18 16M6 16v3M18 16v3M8 13h.01M16 13h.01",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  pin: "M12 21s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12Zm0-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
};
export function Icon({ name, size = 20 }: { name: keyof typeof P | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[name] ?? ""} /></svg>
  );
}

/* ---------- кнопка с ожиданием ---------- */
export function useBusy() {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const run = useCallback(async (fn: () => Promise<unknown>, okText?: string) => {
    setBusy(true);
    try { await fn(); if (okText) toast(okText); return true; }
    catch (e) { toast(errText(e), true); return false; }
    finally { setBusy(false); }
  }, [toast]);
  return { busy, run };
}
