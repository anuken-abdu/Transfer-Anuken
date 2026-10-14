import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Car, Driver } from "../lib/types";
import { DRIVER_STATE, phonePretty, waLink } from "../lib/format";
import { Empty, Field, Icon, Modal, Spinner, useBusy, useRefs, useToast } from "../components/ui";

export function DriversPage({ city }: { city: number }) {
  const { cities, classes } = useRefs();
  const toast = useToast();
  const [list, setList] = useState<Driver[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const load = useCallback(() => api.drivers().then(setList).catch((e) => { toast(e.message, true); setList([]); }), [toast]);
  useEffect(() => { load(); }, [load]);

  const shown = (list ?? []).filter((d) => !city || d.city_id === city);
  const edit = list?.find((d) => d.id === editId) ?? null;
  const clsName = (id: number) => classes.find((c) => c.id === id)?.name_ru ?? "";

  return (
    <div className="page">
      <header className="page-head">
        <h1>Водители <span className="count">{shown.length}</span></h1>
        <button className="btn" onClick={() => setAdding(true)}><Icon name="plus" size={18} />Добавить</button>
      </header>
      {list === null ? <Spinner /> : shown.length === 0 ? (
        <Empty title="Водителей пока нет" text="Добавьте водителя — он получит логин и пароль для приложения" />
      ) : (
        <ul className="cards">
          {shown.map((d) => (
            <li key={d.id} className={"card driver" + (d.is_active ? "" : " off")}>
              <button className="card-main" onClick={() => setEditId(d.id)}>
                <div className="drv-head">
                  <span className={"state s-" + d.state} />
                  <div><p className="strong">{d.profile?.full_name}</p><small className="muted">{d.is_active ? DRIVER_STATE[d.state] : "Отключён"} · {cities.find((c) => c.id === d.city_id)?.name_ru} · комиссия {d.commission_pct}%</small></div>
                </div>
                {d.cars.length === 0
                  ? <p className="field-hint">Нет машины — заказы назначить нельзя</p>
                  : d.cars.map((c) => <p key={c.id} className="car-line"><Icon name="car" size={16} />{c.make} {c.model} <b className="plate">{c.plate}</b> <span className="muted">· {clsName(c.car_class_id)}</span></p>)}
              </button>
              {d.profile?.phone && (
                <div className="card-actions">
                  <a className="btn ghost sm" href={"tel:" + d.profile.phone}><Icon name="phone" size={16} />{phonePretty(d.profile.phone)}</a>
                  <a className="btn ghost sm" href={waLink(d.profile.phone)} target="_blank" rel="noreferrer" aria-label="WhatsApp"><Icon name="chat" size={16} /></a>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {adding && <AddDriver defaultCity={city || cities[0]?.id} onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />}
      {edit && <EditDriver driver={edit} onClose={() => setEditId(null)} onChanged={load} />}
    </div>
  );
}

function AddDriver({ defaultCity, onClose, onDone }: { defaultCity: number; onClose: () => void; onDone: () => void }) {
  const { cities } = useRefs();
  const toast = useToast();
  const { busy, run } = useBusy();
  const [f, setF] = useState({ full_name: "", phone: "", email: "", password: genPassword(), city_id: defaultCity, commission_pct: "20" });
  const submit = () => {
    if (f.full_name.trim().length < 2) return toast("Укажите ФИО", true);
    if (f.phone.replace(/\D/g, "").length < 10) return toast("Укажите телефон", true);
    if (!/^\S+@\S+\.\S+$/.test(f.email)) return toast("Укажите email — это логин водителя", true);
    run(() => api.createDriver({ ...f, commission_pct: Number(f.commission_pct) }), "Водитель добавлен").then((ok) => ok && onDone());
  };
  return (
    <Modal title="Новый водитель" onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onClose}>Отмена</button>
      <button className="btn" disabled={busy} onClick={submit}>{busy ? "Создаю…" : "Создать"}</button>
    </>}>
      <div className="form-grid">
        <Field label="ФИО" span><input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
        <Field label="Телефон"><input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+7 7__ ___ __ __" /></Field>
        <Field label="Город">
          <select value={f.city_id} onChange={(e) => setF({ ...f, city_id: Number(e.target.value) })}>
            {cities.map((c) => <option key={c.id} value={c.id}>{c.name_ru}</option>)}
          </select>
        </Field>
        <Field label="Email (логин)"><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value.trim() })} autoComplete="off" /></Field>
        <Field label="Пароль" hint="Передайте водителю вместе с email"><input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        <Field label="Комиссия сервиса, %"><input inputMode="decimal" value={f.commission_pct} onChange={(e) => setF({ ...f, commission_pct: e.target.value.replace(/[^\d.]/g, "") })} /></Field>
      </div>
      <p className="field-hint">Машину водителя добавите в его карточке после создания.</p>
    </Modal>
  );
}

function EditDriver({ driver, onClose, onChanged }: { driver: Driver; onClose: () => void; onChanged: () => void }) {
  const { cities } = useRefs();
  const { busy, run } = useBusy();
  const [f, setF] = useState({ city_id: driver.city_id, commission_pct: String(driver.commission_pct), is_active: driver.is_active, note: driver.note ?? "" });
  const [car, setCar] = useState<(Partial<Car> & { driver_id: string }) | null>(null);
  const save = () => run(async () => {
    await api.updateDriver(driver.id, { city_id: f.city_id, commission_pct: Number(f.commission_pct), is_active: f.is_active, note: f.note || null });
    onChanged();
  }, "Сохранено").then((ok) => ok && onClose());

  return (
    <Modal title={driver.profile?.full_name ?? "Водитель"} onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onClose}>Закрыть</button>
      <button className="btn" disabled={busy} onClick={save}>Сохранить</button>
    </>}>
      <div className="form-grid">
        <Field label="Город">
          <select value={f.city_id} onChange={(e) => setF({ ...f, city_id: Number(e.target.value) })}>
            {cities.map((c) => <option key={c.id} value={c.id}>{c.name_ru}</option>)}
          </select>
        </Field>
        <Field label="Комиссия, %"><input inputMode="decimal" value={f.commission_pct} onChange={(e) => setF({ ...f, commission_pct: e.target.value.replace(/[^\d.]/g, "") })} /></Field>
        <Field label="Заметка" span><textarea rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <label className="check span"><input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} /> Работает (снимите, чтобы отключить)</label>
      </div>

      <h3 className="sub">Машины</h3>
      <ul className="mini-list">
        {driver.cars.map((c) => (
          <li key={c.id}><span>{c.make} {c.model} <b className="plate">{c.plate}</b>{c.is_active ? "" : " · отключена"}</span>
            <button className="icon-btn" aria-label="Изменить" onClick={() => setCar({ ...c })}><Icon name="edit" size={18} /></button></li>
        ))}
      </ul>
      <button className="btn ghost sm" onClick={() => setCar({ driver_id: driver.id, seats: 4, is_active: true })}><Icon name="plus" size={16} />Добавить машину</button>
      {car && <CarForm car={car} onClose={() => setCar(null)} onSaved={() => { setCar(null); onChanged(); }} />}
    </Modal>
  );
}

function CarForm({ car, onClose, onSaved }: { car: Partial<Car> & { driver_id: string }; onClose: () => void; onSaved: () => void }) {
  const { classes } = useRefs();
  const toast = useToast();
  const { busy, run } = useBusy();
  const [c, setC] = useState({
    make: car.make ?? "", model: car.model ?? "", year: car.year?.toString() ?? "", color: car.color ?? "",
    plate: car.plate ?? "", seats: String(car.seats ?? 4), car_class_id: car.car_class_id ?? classes[0]?.id ?? 1, is_active: car.is_active ?? true,
  });
  const submit = () => {
    if (!c.make.trim() || !c.model.trim() || c.plate.trim().length < 4) return toast("Заполните марку, модель и госномер", true);
    run(() => api.saveCar({
      id: car.id, driver_id: car.driver_id, car_class_id: c.car_class_id, make: c.make.trim(), model: c.model.trim(),
      year: c.year ? Number(c.year) : null, color: c.color.trim() || null, plate: c.plate.trim().toUpperCase(),
      seats: Number(c.seats) || 4, is_active: c.is_active,
    }), "Машина сохранена").then((ok) => ok && onSaved());
  };
  return (
    <Modal title={car.id ? "Машина" : "Новая машина"} onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onClose}>Отмена</button>
      <button className="btn" disabled={busy} onClick={submit}>Сохранить</button>
    </>}>
      <div className="form-grid">
        <Field label="Марка"><input value={c.make} onChange={(e) => setC({ ...c, make: e.target.value })} placeholder="Mercedes-Benz" /></Field>
        <Field label="Модель"><input value={c.model} onChange={(e) => setC({ ...c, model: e.target.value })} placeholder="E 200" /></Field>
        <Field label="Госномер"><input value={c.plate} onChange={(e) => setC({ ...c, plate: e.target.value.toUpperCase() })} placeholder="777 ABC 02" /></Field>
        <Field label="Цвет"><input value={c.color} onChange={(e) => setC({ ...c, color: e.target.value })} placeholder="Чёрный" /></Field>
        <Field label="Год"><input inputMode="numeric" value={c.year} onChange={(e) => setC({ ...c, year: e.target.value.replace(/\D/g, "").slice(0, 4) })} /></Field>
        <Field label="Мест для пассажиров"><input inputMode="numeric" value={c.seats} onChange={(e) => setC({ ...c, seats: e.target.value.replace(/\D/g, "") })} /></Field>
        <Field label="Класс" span>
          <select value={c.car_class_id} onChange={(e) => setC({ ...c, car_class_id: Number(e.target.value) })}>
            {classes.map((k) => <option key={k.id} value={k.id}>{k.name_ru}{k.description_ru ? ` — ${k.description_ru}` : ""}</option>)}
          </select>
        </Field>
        <label className="check span"><input type="checkbox" checked={c.is_active} onChange={(e) => setC({ ...c, is_active: e.target.checked })} /> Машина на линии</label>
      </div>
    </Modal>
  );
}

function genPassword() {
  const a = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const r = crypto.getRandomValues(new Uint32Array(10));
  return Array.from(r, (n) => a[n % a.length]).join("");
}
