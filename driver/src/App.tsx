import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { api, configured } from "./lib/api";
import type { CarClass, DriverOrder, Me } from "./lib/types";
import { dayLabel, errText, isToday, money, phonePretty, plural, relative, STATUS, timeOnly } from "./lib/format";
import { alertNewOrder, askNotifications, isIOS, isStandalone, notificationState, unlockSound, useLocationPing, useWakeLock } from "./lib/device";
import { Icon, Spinner, useBusy, useToast } from "./ui";
import { OrderView } from "./OrderView";

type Tab = "orders" | "history" | "profile";

export default function App() {
  const [me, setMe] = useState<Me | null | "not_driver" | undefined>(undefined);
  const [err, setErr] = useState("");
  const boot = useCallback(async () => {
    try { setMe(await api.me()); } catch (e) { setErr(errText(e)); setMe(null); }
  }, []);
  useEffect(() => { if (configured) boot(); }, [boot]);

  if (!configured) return <Screen title="Нужна настройка" text="Не указаны ключи Supabase (VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY)." />;
  if (me === undefined) return <div className="center"><Spinner /></div>;
  if (me === null) return <Login onDone={boot} initialError={err} />;
  if (me === "not_driver") return <Screen title="Это приложение для водителей" text="Ваш аккаунт не подключён как водитель. Обратитесь к диспетчеру." logout />;
  if (!me.is_active) return <Screen title="Аккаунт отключён" text="Диспетчер временно отключил ваш аккаунт. Свяжитесь с ним." logout />;
  return <Main me={me} reloadMe={boot} />;
}

function Main({ me, reloadMe }: { me: Me; reloadMe: () => Promise<void> }) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("orders");
  const [orders, setOrders] = useState<DriverOrder[] | null>(null);
  const [classes, setClasses] = useState<CarClass[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const known = useRef<Set<string> | null>(null);
  const openRef = useRef<string | null>(null);
  const mine = useRef<Set<string>>(new Set()); // заказы, которые водитель сам завершил или от которых отказался
  useEffect(() => { openRef.current = openId; }, [openId]);

  const load = useCallback(async () => {
    try {
      const list = await api.active();
      const prev = known.current;
      if (prev) {
        const fresh = list.filter((o) => !prev.has(o.id));
        if (fresh.length) {
          const o = fresh[0];
          alertNewOrder(`Новый заказ: ${timeOnly(o.pickup_at)}, ${o.pickup_address}`);
          toast(`Новый заказ на ${dayLabel(o.pickup_at).toLowerCase()} ${timeOnly(o.pickup_at)}`);
        }
        const gone = [...prev].filter((id) => !list.some((o) => o.id === id) && !mine.current.has(id));
        if (gone.length) {
          toast(gone.length === 1 ? "Диспетчер снял с вас заказ" : `Диспетчер снял с вас ${gone.length} заказа`, true);
          if (openRef.current && gone.includes(openRef.current)) setOpenId(null);
        }
      }
      known.current = new Set(list.map((o) => o.id));
      setOrders(list);
    } catch (e) { toast(errText(e), true); setOrders((o) => o ?? []); }
  }, [toast]);

  useEffect(() => { load(); api.classes().then(setClasses).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => api.onChange(me.id, () => { load(); }), [me.id, load]);
  useEffect(() => {
    // запасной опрос: realtime не сообщает, когда заказ переназначили на другого водителя
    const t = setInterval(load, 60_000);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [load]);

  const online = me.state !== "offline";
  const onGeoError = useCallback((m: string) => toast(m, true), [toast]);
  useLocationPing(online && !api.demo, onGeoError);
  const inRide = (orders ?? []).some((o) => ["en_route", "arrived", "in_progress"].includes(o.status));
  useWakeLock(inRide);

  const { busy, run } = useBusy();
  const toggleOnline = () => {
    unlockSound();
    run(async () => { await api.setOnline(!online); await reloadMe(); }, online ? "Вы ушли с линии" : "Вы на линии");
  };

  const cls = (id: number) => classes.find((c) => c.id === id)?.name_ru ?? "";
  const open = orders?.find((o) => o.id === openId);

  if (open) {
    return <OrderView order={open} citySlug={me.city?.slug ?? "almaty"} className={cls(open.car_class_id)}
      onBack={() => setOpenId(null)} onChanged={async (finished) => { if (finished) mine.current.add(open.id); await load(); }} />;
  }

  return (
    <div className="app">
      <header className="top">
        <div className="who">
          <p className="hello">{me.full_name?.split(" ")[0] ?? "Водитель"}</p>
          <p className="muted sm">{me.cars[0] ? `${me.cars[0].model} · ${me.cars[0].plate}` : "Машина не добавлена"}</p>
        </div>
        <button className={"line-switch" + (online ? " on" : "")} role="switch" aria-checked={online} disabled={busy} onClick={toggleOnline}>
          <span className="knob" />
          <span className="lbl">{online && (inRide || me.state === "busy") ? "На заказе" : online ? "На линии" : "Не на линии"}</span>
        </button>
      </header>

      <main className="content">
        {tab === "orders" && <OrdersTab orders={orders} cls={cls} onOpen={setOpenId} online={online} onGoOnline={toggleOnline} />}
        {tab === "history" && <HistoryTab cls={cls} />}
        {tab === "profile" && <ProfileTab me={me} cls={cls} />}
      </main>

      <nav className="tabs">
        {([["orders", "Заказы", "list"], ["history", "История", "clock"], ["profile", "Профиль", "user"]] as [Tab, string, string][]).map(([id, label, icon]) => (
          <button key={id} className={tab === id ? "on" : ""} onClick={() => { setTab(id); window.scrollTo(0, 0); }} aria-current={tab === id}>
            <Icon name={icon} size={24} /><span>{label}</span>
            {id === "orders" && orders && orders.length > 0 && <i className="dot-count">{orders.length}</i>}
          </button>
        ))}
      </nav>
    </div>
  );
}

function OrdersTab({ orders, cls, onOpen, online, onGoOnline }: {
  orders: DriverOrder[] | null; cls: (id: number) => string; onOpen: (id: string) => void; online: boolean; onGoOnline: () => void;
}) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30_000); return () => clearInterval(t); }, []);
  if (orders === null) return <Spinner />;

  const current = orders.find((o) => ["en_route", "arrived", "in_progress"].includes(o.status)) ?? orders[0];
  const rest = orders.filter((o) => o !== current);
  const groups = new Map<string, DriverOrder[]>();
  rest.forEach((o) => { const k = dayLabel(o.pickup_at); groups.set(k, [...(groups.get(k) ?? []), o]); });

  return (
    <>
      {!online && (
        <div className="banner">
          <p><b>Вы не на линии.</b> Выйдите на линию, чтобы диспетчер видел, что вы готовы к заказам.</p>
          <button className="btn sm" onClick={onGoOnline}>Выйти на линию</button>
        </div>
      )}
      {!current ? (
        <div className="empty">
          <Icon name="car" size={40} />
          <p className="strong lg">Заказов пока нет</p>
          <p className="muted">Когда диспетчер назначит заказ, он появится здесь, телефон подаст сигнал.</p>
        </div>
      ) : (
        <>
          <p className="section-label">{["en_route", "arrived", "in_progress"].includes(current.status) ? "Сейчас" : "Ближайший заказ"}</p>
          <button className="next-card" onClick={() => onOpen(current.id)}>
            <div className="nc-top">
              <span className="nc-time">{timeOnly(current.pickup_at)}</span>
              <span className="nc-rel">{dayLabel(current.pickup_at)} · {relative(current.pickup_at)}</span>
              <span className={"chip t-" + STATUS[current.status].tone}>{STATUS[current.status].label}</span>
            </div>
            <Route o={current} />
            <div className="nc-foot">
              <span>{cls(current.car_class_id)}{current.flight_number ? ` · рейс ${current.flight_number}` : ""}</span>
              <b>{money(current.driver_payout)}</b>
            </div>
            <span className="nc-open">Открыть заказ</span>
          </button>
        </>
      )}
      {[...groups.entries()].map(([day, list]) => (
        <section key={day}>
          <p className="section-label">{day} <span>{list.length} {plural(list.length, "заказ", "заказа", "заказов")}</span></p>
          <ul className="list">
            {list.map((o) => (
              <li key={o.id}>
                <button className="row-card" onClick={() => onOpen(o.id)}>
                  <span className="rc-time">{timeOnly(o.pickup_at)}</span>
                  <span className="rc-main"><Route o={o} compact /></span>
                  <span className="rc-pay">{money(o.driver_payout)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function Route({ o, compact }: { o: DriverOrder; compact?: boolean }) {
  return (
    <span className={"route" + (compact ? " compact" : "")}>
      <span className="r-from">{o.pickup_address}</span>
      <span className="r-to">{o.type === "hourly" ? `Почасовая · ${o.hours} ч` : o.dropoff_address}</span>
    </span>
  );
}

function HistoryTab({ cls }: { cls: (id: number) => string }) {
  const toast = useToast();
  const [list, setList] = useState<DriverOrder[] | null>(null);
  useEffect(() => { api.history(30).then(setList).catch((e) => { toast(errText(e), true); setList([]); }); }, [toast]);
  const sums = useMemo(() => {
    const done = (list ?? []).filter((o) => o.status === "completed");
    const sum = (f: (o: DriverOrder) => boolean) => done.filter(f).reduce((s, o) => s + (o.driver_payout ?? 0), 0);
    const week = Date.now() - 7 * 864e5;
    return {
      today: sum((o) => isToday(o.pickup_at)), week: sum((o) => new Date(o.pickup_at).getTime() >= week),
      month: sum(() => true), count: done.length,
    };
  }, [list]);
  if (list === null) return <Spinner />;
  return (
    <>
      <div className="earn">
        <div className="earn-main"><small className="muted">Заработок за 30 дней</small><p className="earn-sum">{money(sums.month)}</p><small className="muted">{sums.count} {plural(sums.count, "поездка", "поездки", "поездок")}</small></div>
        <div className="earn-row">
          <div><small className="muted">Сегодня</small><b>{money(sums.today)}</b></div>
          <div><small className="muted">7 дней</small><b>{money(sums.week)}</b></div>
        </div>
      </div>
      {list.length === 0 ? <div className="empty"><p className="muted">Здесь появятся выполненные заказы</p></div> : (
        <ul className="list">
          {list.map((o) => (
            <li key={o.id} className={"hist" + (o.status === "cancelled" ? " off" : "")}>
              <div className="h-left"><b>{dayLabel(o.pickup_at)}, {timeOnly(o.pickup_at)}</b><small className="muted">№{o.number} · {cls(o.car_class_id)}</small></div>
              <span className="h-route"><Route o={o} compact /></span>
              <span className="h-pay">{o.status === "cancelled" ? "Отменён" : money(o.driver_payout)}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ProfileTab({ me, cls }: { me: Me; cls: (id: number) => string }) {
  const toast = useToast();
  const [notif, setNotif] = useState(notificationState());
  const standalone = isStandalone();
  return (
    <div className="profile">
      <div className="card">
        <p className="strong lg">{me.full_name}</p>
        <p className="muted">{phonePretty(me.phone)} · {me.city?.name_ru}</p>
        <div className="kv">
          <div><small className="muted">Рейтинг</small><b>{me.rating.toFixed(2)}</b></div>
          <div><small className="muted">Комиссия сервиса</small><b>{me.commission_pct}%</b></div>
        </div>
      </div>
      <p className="section-label">Машина</p>
      {me.cars.length === 0 ? <div className="card"><p className="muted">Машина не добавлена. Попросите диспетчера внести её в систему.</p></div> :
        me.cars.map((c) => (
          <div key={c.id} className="card car">
            <Icon name="car" size={28} />
            <div><p className="strong">{c.color} {c.make} {c.model}</p><p className="muted">{cls(c.car_class_id)}{c.is_active ? "" : " · отключена"}</p></div>
            <span className="plate">{c.plate}</span>
          </div>
        ))}

      <p className="section-label">Настройки</p>
      <div className="card settings">
        <div className="set-row">
          <Icon name="bell" size={22} />
          <div><p className="strong">Уведомления</p><p className="muted sm">{notif === "granted" ? "Включены" : notif === "denied" ? "Запрещены в настройках телефона" : notif === "unsupported" ? (isIOS() && !standalone ? "Сначала установите приложение на экран" : "Не поддерживаются") : "Сигнал о новых заказах, когда приложение свёрнуто"}</p></div>
          {notif === "default" && <button className="btn sm" onClick={async () => { unlockSound(); const r = await askNotifications(); setNotif(r); if (r === "granted") toast("Уведомления включены"); }}>Включить</button>}
        </div>
        {!standalone && (
          <div className="set-row">
            <Icon name="install" size={22} />
            <div>
              <p className="strong">Установить на телефон</p>
              <p className="muted sm">{isIOS()
                ? "Safari → кнопка «Поделиться» → «На экран Домой»"
                : "Меню браузера (три точки) → «Установить приложение» или «Добавить на главный экран»"}</p>
            </div>
          </div>
        )}
      </div>
      <p className="hint">Держите приложение открытым во время заказа: так диспетчер и клиент видят, где машина, а экран не гаснет.</p>
      <button className="btn ghost wide" onClick={() => api.signOut().then(() => location.reload())}><Icon name="logout" />Выйти из аккаунта</button>
    </div>
  );
}

function Login({ onDone, initialError }: { onDone: () => void; initialError: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError);
  const [sending, setSending] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError(""); setSending(true); unlockSound();
    try { await api.signIn(email.trim(), password); onDone(); } catch (x) { setError(errText(x)); } finally { setSending(false); }
  };
  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="brand"><Logo /><div><b>Anuken</b><span>Transfer · водитель</span></div></div>
        <label className="field"><span>Email</span><input id="email" type="email" inputMode="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="field"><span>Пароль</span><input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn wide action" disabled={sending}>{sending ? "Вход…" : "Войти"}</button>
        <p className="muted sm center-text">Логин и пароль выдаёт диспетчер</p>
      </form>
    </div>
  );
}

function Screen({ title, text, logout }: { title: string; text: string; logout?: boolean }) {
  return (
    <div className="login"><div className="login-card">
      <div className="brand"><Logo /><div><b>Anuken</b><span>Transfer · водитель</span></div></div>
      <p className="strong lg">{title}</p><p className="muted">{text}</p>
      {logout && <button className="btn ghost wide" onClick={() => api.signOut().then(() => location.reload())}>Выйти</button>}
    </div></div>
  );
}

const Logo = () => (
  <svg width="44" height="44" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="var(--logo-bg)" />
    <path d="M18 46 32 16l14 30" fill="none" stroke="var(--gold)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M23 36h18" stroke="var(--gold)" strokeWidth="5" strokeLinecap="round" /></svg>
);
