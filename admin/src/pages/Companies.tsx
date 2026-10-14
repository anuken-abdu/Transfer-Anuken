import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Company } from "../lib/types";
import { phonePretty } from "../lib/format";
import { Empty, Field, Icon, Modal, Spinner, useBusy, useToast } from "../components/ui";

const blank: Omit<Company, "id"> = { name: "", bin: null, contact_name: null, contact_phone: null, email: null, discount_pct: 0, is_active: true, note: null };

export function CompaniesPage() {
  const toast = useToast();
  const [list, setList] = useState<Company[] | null>(null);
  const [edit, setEdit] = useState<(Omit<Company, "id"> & { id?: number }) | null>(null);
  const load = useCallback(() => api.companies().then(setList).catch((e) => { toast(e.message, true); setList([]); }), [toast]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="page">
      <header className="page-head">
        <h1>Компании <span className="count">{list?.length ?? ""}</span></h1>
        <button className="btn" onClick={() => setEdit({ ...blank })}><Icon name="plus" size={18} />Добавить</button>
      </header>
      <p className="field-hint">Корпоративные клиенты: отели, офисы, агентства. Скидка применяется к тарифу автоматически, доступна оплата по счёту.</p>
      {list === null ? <Spinner /> : list.length === 0 ? <Empty title="Компаний пока нет" /> : (
        <ul className="cards">
          {list.map((c) => (
            <li key={c.id} className={"card" + (c.is_active ? "" : " off")}>
              <button className="card-main" onClick={() => setEdit({ ...c })}>
                <p className="strong">{c.name}</p>
                <small className="muted">{[c.bin && "БИН " + c.bin, c.contact_name, c.contact_phone && phonePretty(c.contact_phone)].filter(Boolean).join(" · ") || "Контакты не указаны"}</small>
                {c.discount_pct > 0 && <p className="discount">Скидка {c.discount_pct}%</p>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {edit && <CompanyForm value={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}

function CompanyForm({ value, onClose, onSaved }: { value: Omit<Company, "id"> & { id?: number }; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { busy, run } = useBusy();
  const [c, setC] = useState(value);
  const set = <K extends keyof typeof c>(k: K, v: (typeof c)[K]) => setC({ ...c, [k]: v });
  const submit = () => {
    if (c.name.trim().length < 2) return toast("Укажите название", true);
    if (c.bin && !/^\d{12}$/.test(c.bin)) return toast("БИН — 12 цифр", true);
    if (c.discount_pct < 0 || c.discount_pct > 50) return toast("Скидка от 0 до 50%", true);
    run(() => api.saveCompany({ ...c, name: c.name.trim() }), "Компания сохранена").then((ok) => ok && onSaved());
  };
  return (
    <Modal title={value.id ? c.name || "Компания" : "Новая компания"} onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onClose}>Отмена</button>
      <button className="btn" disabled={busy} onClick={submit}>Сохранить</button>
    </>}>
      <div className="form-grid">
        <Field label="Название" span><input value={c.name} onChange={(e) => set("name", e.target.value)} placeholder="ТОО «…»" /></Field>
        <Field label="БИН"><input inputMode="numeric" value={c.bin ?? ""} onChange={(e) => set("bin", e.target.value.replace(/\D/g, "").slice(0, 12) || null)} /></Field>
        <Field label="Скидка, %"><input inputMode="decimal" value={String(c.discount_pct)} onChange={(e) => set("discount_pct", Number(e.target.value.replace(/[^\d.]/g, "")) || 0)} /></Field>
        <Field label="Контактное лицо"><input value={c.contact_name ?? ""} onChange={(e) => set("contact_name", e.target.value || null)} /></Field>
        <Field label="Телефон"><input type="tel" value={c.contact_phone ?? ""} onChange={(e) => set("contact_phone", e.target.value || null)} /></Field>
        <Field label="Email" span><input type="email" value={c.email ?? ""} onChange={(e) => set("email", e.target.value.trim() || null)} /></Field>
        <Field label="Заметка" span><textarea rows={2} value={c.note ?? ""} onChange={(e) => set("note", e.target.value || null)} /></Field>
        <label className="check span"><input type="checkbox" checked={c.is_active} onChange={(e) => set("is_active", e.target.checked)} /> Активна</label>
      </div>
    </Modal>
  );
}
