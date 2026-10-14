import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { errText } from "./lib/format";

type T = { id: number; text: string; bad?: boolean };
const Ctx = createContext<(text: string, bad?: boolean) => void>(() => {});
export const useToast = () => useContext(Ctx);
export function ToastHost({ children }: { children: ReactNode }) {
  const [list, setList] = useState<T[]>([]);
  const push = useCallback((text: string, bad = false) => {
    const id = Date.now() + Math.random();
    setList((l) => [...l.slice(-2), { id, text, bad }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), bad ? 6000 : 3200);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {list.map((t) => <div key={t.id} className={"toast" + (t.bad ? " bad" : "")}>{t.text}</div>)}
      </div>
    </Ctx.Provider>
  );
}

export function useBusy() {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const run = useCallback(async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try { await fn(); if (ok) toast(ok); return true; }
    catch (e) { toast(errText(e), true); return false; }
    finally { setBusy(false); }
  }, [toast]);
  return { busy, run };
}

const P: Record<string, string> = {
  list: "M4 6h16M4 12h16M4 18h10",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4l3 2",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0",
  back: "M15 5l-7 7 7 7",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2",
  chat: "M4 5h16v11H8l-4 4z",
  nav: "M12 2 4 21l8-4 8 4z",
  plane: "M2 16l20-7-6 13-3-6-6-3z",
  sign: "M3 6h18v11H3zM8 21h8M12 17v4",
  bag: "M6 8h12v12H6zM9 8V5h6v3",
  people: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9a6 6 0 0 1 12 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 20a6 6 0 0 0-3-5.2",
  child: "M12 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM7 22l1-8h8l1 8M8 14l-2-4h12l-2 4",
  wallet: "M3 7h18v12H3zM3 7l3-3h12M16 13h2",
  x: "M6 6l12 12M18 6 6 18",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 21h4",
  car: "M5 16h14M6 16l1.5-5h9L18 16M6 16v3M18 16v3M8 13h.01M16 13h.01",
  install: "M12 3v12M7 10l5 5 5-5M5 21h14",
  note: "M5 4h14v16H5zM9 9h6M9 13h6M9 17h3",
};
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[name] ?? ""} /></svg>
  );
}

export const Spinner = () => <div className="spinner" aria-label="Загрузка" />;
