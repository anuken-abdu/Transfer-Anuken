import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { api, configured } from "./lib/api";
import type { Profile } from "./lib/types";
import { dateTime, errText } from "./lib/format";
import { armAlerts, newOrderAlert } from "./lib/alert";
import { Icon, RefsCtx, Spinner, type Refs, useRefs, useToast } from "./components/ui";
import { OrdersPage } from "./pages/Orders";
import { DriversPage } from "./pages/Drivers";
import { TariffsPage } from "./pages/Tariffs";
import { CompaniesPage } from "./pages/Companies";

type Page = "orders" | "drivers" | "tariffs" | "companies";
const NAV: { id: Page; label: string; icon: string }[] = [
  { id: "orders", label: "Заказы", icon: "orders" },
  { id: "drivers", label: "Водители", icon: "drivers" },
  { id: "tariffs", label: "Тарифы", icon: "tariffs" },
  { id: "companies", label: "Компании", icon: "companies" },
];
const pageFromHash = (): Page => {
  const h = location.hash.replace("#/", "") as Page;
  return NAV.some((n) => n.id === h) ? h : "orders";
};
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* приватный режим */ } },
};

export default function App() {
  const [me, setMe] = useState<Profile | null | undefined>(undefined);
  const [refs, setRefs] = useState<Refs | null>(null);
  const [err, setErr] = useState("");

  const boot = useCallback(async () => {
    setErr("");
    try {
      const p = await api.me();
      setMe(p);
      if (p && (p.role === "admin" || p.role === "dispatcher")) {
        const [cities, classes] = await Promise.all([api.cities(), api.classes()]);
        setRefs({ cities, classes });
      }
    } catch (e) { setErr(errText(e)); setMe(null); }
  }, []);
  useEffect(() => { if (configured) boot(); }, [boot]);

  if (!configured) return <Setup />;
  if (me === undefined) return <div className="center"><Spinner /></div>;
  if (!me) return <Login onDone={boot} initialError={err} />;
  if (me.role !== "admin" && me.role !== "dispatcher") return <NoAccess />;
  if (!refs) return <div className="center"><Spinner /></div>;
  return <RefsCtx.Provider value={refs}><Shell me={me} /></RefsCtx.Provider>;
}

function Shell({ me }: { me: Profile }) {
  const [page, setPage] = useState<Page>(pageFromHash);
  const [city, setCity] = useState<number>(() => Number(store.get("at.city")) || 0);
  const [newOpen, setNewOpen] = useState(false);
  const { cities } = useRefs();

  useEffect(() => {
    const on = () => setPage(pageFromHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  // сигнал о новых заказах с сайта и из приложения клиента — на любой странице админки
  const toast = useToast();
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    armAlerts();
    const check = async () => {
      try {
        const list = await api.orders({ status: "new" });
        const prev = known.current;
        known.current = new Set(list.map((o) => o.id));
        if (!prev) return;
        const fresh = list.filter((o) => !prev.has(o.id) && o.source !== "admin");
        if (fresh.length) {
          const o = fresh[0];
          const text = `№${o.number} · ${dateTime(o.pickup_at)} · ${o.pickup_address}`;
          newOrderAlert(text);
          toast("Новый заказ " + text);
        }
      } catch { /* следующая проверка по событию или таймеру */ }
    };
    check();
    const off = api.onOrdersChange(check);
    const t = setInterval(check, 60_000);
    return () => { off(); clearInterval(t); };
  }, [toast]);

  const go = (p: Page) => { location.hash = "/" + p; setPage(p); window.scrollTo(0, 0); };
  const pickCity = (v: number) => { setCity(v); store.set("at.city", String(v)); };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><Logo /><div><b>Anuken</b><span>Transfer</span></div></div>
        <nav>
          {NAV.map((n) => (
            <a key={n.id} href={"#/" + n.id} className={page === n.id ? "on" : ""} onClick={(e) => { e.preventDefault(); go(n.id); }}>
              <Icon name={n.icon} />{n.label}
            </a>
          ))}
        </nav>
        <div className="me">
          <div><b>{me.full_name || me.email}</b><span>{me.role === "admin" ? "Администратор" : "Диспетчер"}</span></div>
          <button className="icon-btn" onClick={() => api.signOut().then(() => location.reload())} aria-label="Выйти"><Icon name="logout" /></button>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div className="brand mobile-only"><Logo /><b>Anuken Transfer</b></div>
          <select className="city-select" value={city} onChange={(e) => pickCity(Number(e.target.value))} aria-label="Город">
            <option value={0}>Все города</option>
            {cities.map((c) => <option key={c.id} value={c.id}>{c.name_ru}</option>)}
          </select>
          {api.demo && <span className="demo-tag">Демо-данные</span>}
          <button className="icon-btn mobile-only" onClick={() => api.signOut().then(() => location.reload())} aria-label="Выйти"><Icon name="logout" /></button>
        </div>
        {page === "orders" && <OrdersPage city={city} newOpen={newOpen} setNewOpen={setNewOpen} />}
        {page === "drivers" && <DriversPage city={city} />}
        {page === "tariffs" && <TariffsPage city={city} />}
        {page === "companies" && <CompaniesPage />}
      </div>

      {page === "orders" && (
        <button className="fab mobile-only" onClick={() => setNewOpen(true)} aria-label="Новый заказ"><Icon name="plus" size={26} /></button>
      )}
      <nav className="tabbar">
        {NAV.map((n) => (
          <a key={n.id} href={"#/" + n.id} className={page === n.id ? "on" : ""} onClick={(e) => { e.preventDefault(); go(n.id); }}>
            <Icon name={n.icon} size={22} /><span>{n.label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}

function Logo() {
  return <svg width="32" height="32" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="var(--ink-2)" /><path d="M18 46 32 16l14 30" fill="none" stroke="var(--gold)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /><path d="M23 36h18" stroke="var(--gold)" strokeWidth="5" strokeLinecap="round" /></svg>;
}

function Login({ onDone, initialError }: { onDone: () => void; initialError: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError);
  const [sending, setSending] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(""); setSending(true);
    try { await api.signIn(email.trim(), password); onDone(); }
    catch (x) { setError(errText(x)); }
    finally { setSending(false); }
  };
  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="brand big"><Logo /><div><b>Anuken</b><span>Transfer</span></div></div>
        <h1>Диспетчерская</h1>
        <label className="field"><span className="field-label">Email</span><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="field"><span className="field-label">Пароль</span><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn wide" disabled={sending}>{sending ? "Вход…" : "Войти"}</button>
      </form>
    </div>
  );
}

function NoAccess() {
  return (
    <div className="login"><div className="login-card">
      <h1>Нет доступа</h1>
      <p className="muted">Этот аккаунт не является диспетчером или администратором. Водители работают через приложение для водителей.</p>
      <button className="btn wide" onClick={() => api.signOut().then(() => location.reload())}>Выйти</button>
    </div></div>
  );
}

function Setup() {
  return (
    <div className="login"><div className="login-card">
      <h1>Нужна настройка</h1>
      <p className="muted">Не указаны ключи Supabase. Создайте файл <code>.env</code> по образцу <code>.env.example</code> или задайте переменные VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в Vercel.</p>
    </div></div>
  );
}
