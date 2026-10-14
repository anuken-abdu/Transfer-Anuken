import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { Driver, Order, OrderFilter } from "../lib/types";
import { dayLabel, money, plural, STATUS, timeOnly, todayKey, TYPE } from "../lib/format";
import { Badge, Empty, Icon, Segmented, Spinner, useRefs, useToast } from "../components/ui";
import { OrderSheet } from "../components/OrderSheet";
import { NewOrder } from "../components/NewOrder";

type Range = "today" | "tomorrow" | "week" | "all";
type StatusTab = "active" | "new" | "completed" | "cancelled" | "all";

export function OrdersPage({ city, newOpen, setNewOpen }: { city: number; newOpen: boolean; setNewOpen: (v: boolean) => void }) {
  const { classes } = useRefs();
  const toast = useToast();
  const [range, setRange] = useState<Range>("today");
  const [tab, setTab] = useState<StatusTab>("active");
  const [q, setQ] = useState("");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const filter = useMemo<OrderFilter>(() => {
    const f: OrderFilter = { city: city || undefined, status: tab === "new" ? "new" : tab, q: q.trim() || undefined };
    if (range === "today") { f.from = todayKey(); f.to = todayKey(); }
    if (range === "tomorrow") { f.from = todayKey(1); f.to = todayKey(1); }
    if (range === "week") { f.from = todayKey(); f.to = todayKey(6); }
    // активные заказы, просроченные со вчера, тоже показываем на «Сегодня»
    if (range === "today" && tab === "active") f.from = todayKey(-1);
    return f;
  }, [city, range, tab, q]);

  const load = useCallback(async () => {
    try {
      const [o, d] = await Promise.all([api.orders(filter), api.drivers()]);
      setOrders(o); setDrivers(d);
    } catch (e) { toast((e as Error).message, true); setOrders([]); }
  }, [filter, toast]);

  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);
  useEffect(() => api.onOrdersChange(load), [load]);

  const groups = useMemo(() => {
    const m = new Map<string, Order[]>();
    (orders ?? []).forEach((o) => { const k = dayLabel(o.pickup_at); m.set(k, [...(m.get(k) ?? []), o]); });
    return [...m.entries()];
  }, [orders]);

  const stats = useMemo(() => {
    const list = orders ?? [];
    const noDriver = list.filter((o) => ["new", "confirmed"].includes(o.status)).length;
    const noPrice = list.filter((o) => o.price === null && o.status !== "cancelled").length;
    const sum = list.filter((o) => o.status !== "cancelled").reduce((s, o) => s + (o.price ?? 0), 0);
    const margin = list.filter((o) => o.status !== "cancelled" && o.driver_payout !== null)
      .reduce((s, o) => s + ((o.price ?? 0) - (o.driver_payout ?? 0)), 0);
    return { noDriver, noPrice, sum, margin, count: list.length };
  }, [orders]);

  const open = orders?.find((o) => o.id === openId) ?? null;
  const cls = (id: number) => classes.find((c) => c.id === id)?.name_ru ?? "";

  return (
    <div className="page">
      <header className="page-head">
        <h1>Заказы</h1>
        <button className="btn desktop-only" onClick={() => setNewOpen(true)}><Icon name="plus" size={18} />Новый заказ</button>
      </header>

      <div className="toolbar">
        <Segmented label="Период" value={range} onChange={setRange} options={[
          { value: "today", label: "Сегодня" }, { value: "tomorrow", label: "Завтра" },
          { value: "week", label: "7 дней" }, { value: "all", label: "Все" }]} />
        <div className="search">
          <Icon name="search" size={18} />
          <input type="search" placeholder="Номер, имя, телефон" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Поиск заказа" />
        </div>
      </div>
      <div className="chips" role="tablist">
        {([["active", "В работе"], ["new", "Новые"], ["completed", "Выполненные"], ["cancelled", "Отменённые"], ["all", "Все статусы"]] as [StatusTab, string][])
          .map(([v, l]) => <button key={v} role="tab" aria-selected={tab === v} className={tab === v ? "on" : ""} onClick={() => setTab(v)}>{l}</button>)}
      </div>

      {orders && orders.length > 0 && (
        <div className="summary">
          <div><small>Заказов</small><b>{stats.count}</b></div>
          <div className={stats.noDriver ? "alert" : ""}><small>Без водителя</small><b>{stats.noDriver}</b></div>
          <div className={stats.noPrice ? "alert" : ""}><small>Без цены</small><b>{stats.noPrice}</b></div>
          <div><small>Сумма</small><b>{money(stats.sum)}</b></div>
          <div><small>Ваша маржа</small><b>{money(stats.margin)}</b></div>
        </div>
      )}

      {orders === null ? <Spinner /> : orders.length === 0 ? (
        <Empty title="Заказов нет" text="Попробуйте другой период или статус" action={<button className="btn" onClick={() => setNewOpen(true)}>Создать заказ</button>} />
      ) : groups.map(([day, list]) => (
        <section key={day} className="day">
          <h2 className="day-title">{day} <span>{list.length} {plural(list.length, "заказ", "заказа", "заказов")}</span></h2>
          <ul className="order-list">
            {list.map((o) => {
              const st = STATUS[o.status];
              const late = ["new", "confirmed"].includes(o.status) && new Date(o.pickup_at).getTime() - Date.now() < 3 * 36e5;
              return (
                <li key={o.id}>
                  <button className={"order" + (late ? " late" : "")} onClick={() => setOpenId(o.id)}>
                    <div className="o-time"><b>{timeOnly(o.pickup_at)}</b><small>№{o.number}</small></div>
                    <div className="o-route">
                      <p className="o-from">{o.pickup_address}</p>
                      <p className="o-to">{o.type === "hourly" ? `${TYPE.hourly} · ${o.hours} ч` : o.dropoff_address}</p>
                    </div>
                    <div className="o-meta">
                      <Badge tone={st.tone}>{st.label}</Badge>
                      <span className="o-class">{cls(o.car_class_id)}{o.flight_number ? ` · ${o.flight_number}` : ""}</span>
                    </div>
                    <div className="o-who">
                      <p>{o.client_name}</p>
                      <small>{o.driver?.profile?.full_name ? `${o.driver.profile.full_name.split(" ")[0]} · ${o.car?.plate}` : "Водитель не назначен"}</small>
                    </div>
                    <div className="o-price">{money(o.price)}</div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {open && <OrderSheet order={open} drivers={drivers} onClose={() => setOpenId(null)} onChanged={load} />}
      {newOpen && <NewOrder defaultCity={city} onClose={() => setNewOpen(false)} onCreated={(id) => { setNewOpen(false); load().then(() => setOpenId(id)); }} />}
    </div>
  );
}
