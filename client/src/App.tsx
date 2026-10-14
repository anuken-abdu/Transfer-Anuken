import { useCallback, useEffect, useState } from "react";
import { api, configured } from "./lib/api";
import type { CarClass, City } from "./lib/types";
import { detectLang, LangCtx, useT, type Lang } from "./lib/i18n";
import { errText, savedOrders } from "./lib/format";
import { Booking } from "./Booking";
import { MyOrders, Track } from "./Track";

type Route = { page: "book" } | { page: "track"; token: string } | { page: "orders" };

// Адреса: /, /t/<ссылка>, /orders. В превью без адресной строки — #t-<ссылка>, #orders
function readRoute(): Route {
  const m = location.pathname.match(/^\/t\/([0-9a-f-]{36})/i) || location.hash.match(/^#t-([0-9a-f-]{36})/i);
  if (m) return { page: "track", token: m[1] };
  if (location.pathname.startsWith("/orders") || location.hash === "#orders") return { page: "orders" };
  return { page: "book" };
}
function writeRoute(r: Route) {
  const path = r.page === "track" ? `/t/${r.token}` : r.page === "orders" ? "/orders" : "/";
  try { history.pushState(r, "", path); } catch { /* превью без истории — живём в состоянии */ }
}

export default function App() {
  const [lang, setLangState] = useState<Lang>(detectLang);
  const setLang = (l: Lang) => { setLangState(l); try { localStorage.setItem("at.lang", l); } catch { /* ок */ } };
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  return <LangCtx.Provider value={{ lang, setLang }}><Shell /></LangCtx.Provider>;
}

function Shell() {
  const t = useT();
  const [route, setRoute] = useState<Route>(readRoute);
  const [refs, setRefs] = useState<{ cities: City[]; classes: CarClass[] } | null>(null);
  const [err, setErr] = useState("");
  const go = useCallback((r: Route) => { writeRoute(r); setRoute(r); window.scrollTo(0, 0); }, []);

  useEffect(() => {
    const on = () => setRoute(readRoute());
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  useEffect(() => {
    if (!configured) return;
    Promise.all([api.cities(), api.classes()]).then(([cities, classes]) => setRefs({ cities, classes })).catch((e) => setErr(errText(e)));
  }, []);

  const hasOrders = savedOrders().length > 0;
  return (
    <div className="page">
      <Header onHome={() => go({ page: "book" })} onOrders={() => go({ page: "orders" })} showOrders={hasOrders || route.page !== "book"} />
      <main className="main">
        {route.page === "book" && (
          <div className="book-layout">
            <section className="intro">
              <h1>{t("heroTitle")}</h1>
              <p>{t("heroText")}</p>
            </section>
            {!configured ? <p className="panel err">Не указаны ключи Supabase.</p>
              : err ? <p className="panel err">{err}</p>
              : !refs ? <div className="panel"><div className="spinner" aria-label="…" /></div>
              : <Booking cities={refs.cities} classes={refs.classes} onTrack={(token) => go({ page: "track", token })} />}
          </div>
        )}
        {route.page === "track" && <Track key={route.token} token={route.token} onNew={() => go({ page: "book" })} />}
        {route.page === "orders" && <MyOrders onOpen={(token) => go({ page: "track", token })} onNew={() => go({ page: "book" })} />}
      </main>
      <footer className="foot">© Anuken Transfer · {new Date().getFullYear()}</footer>
    </div>
  );
}

function Header({ onHome, onOrders, showOrders }: { onHome: () => void; onOrders: () => void; showOrders: boolean }) {
  const t = useT();
  return (
    <header className="head">
      <button className="brand" onClick={onHome} aria-label="Anuken Transfer">
        <svg width="34" height="34" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#17171a" />
          <path d="M18 46 32 16l14 30" fill="none" stroke="#d2b178" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M23 36h18" stroke="#d2b178" strokeWidth="5" strokeLinecap="round" /></svg>
        <span><b>Anuken Transfer</b><small>{t("brandSub")}</small></span>
      </button>
      <div className="head-r">
        {showOrders && <button className="btn link" onClick={onOrders}>{t("myOrders")}</button>}
        <LangSwitch />
      </div>
    </header>
  );
}

function LangSwitch() {
  return (
    <LangCtx.Consumer>
      {({ lang, setLang }) => (
        <div className="lang" role="radiogroup" aria-label="Язык / Language">
          {(["ru", "en"] as Lang[]).map((l) => <button key={l} role="radio" aria-checked={lang === l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}
        </div>
      )}
    </LangCtx.Consumer>
  );
}
