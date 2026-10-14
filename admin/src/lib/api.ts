import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  CarClass, City, ClassRate, Company, Driver, Car, NewDriverInput, NewOrderInput, Order, OrderEvent,
  OrderFilter, OrderStatus, Profile, Tariff,
} from "./types";
import { ACTIVE_STATUSES, dayStartIso } from "./format";
import { demoApi } from "./demo";

export interface Api {
  demo: boolean;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  me(): Promise<Profile | null>;
  onOrdersChange(cb: () => void): () => void;

  cities(): Promise<City[]>;
  classes(): Promise<CarClass[]>;

  orders(f: OrderFilter): Promise<Order[]>;
  orderEvents(id: string): Promise<OrderEvent[]>;
  createOrder(i: NewOrderInput): Promise<{ id: string; number: number }>;
  quote(i: Pick<NewOrderInput, "city" | "car_class" | "type" | "tariff" | "hours" | "distance_km" | "company">): Promise<number | null>;
  updateOrder(id: string, patch: Partial<Pick<Order, "price" | "payment_status" | "payment_method" | "internal_note">>): Promise<void>;
  assign(orderId: string, driverId: string, carId: number): Promise<void>;
  setStatus(orderId: string, status: OrderStatus, reason?: string): Promise<void>;

  drivers(): Promise<Driver[]>;
  createDriver(i: NewDriverInput): Promise<void>;
  updateDriver(id: string, patch: Partial<Pick<Driver, "city_id" | "commission_pct" | "is_active" | "note">>): Promise<void>;
  saveCar(c: Omit<Car, "id"> & { id?: number }): Promise<void>;

  tariffs(city: number): Promise<Tariff[]>;
  saveTariff(t: Omit<Tariff, "id"> & { id?: number }): Promise<void>;
  rates(city: number): Promise<ClassRate[]>;
  saveRate(r: ClassRate): Promise<void>;

  companies(): Promise<Company[]>;
  saveCompany(c: Omit<Company, "id"> & { id?: number }): Promise<void>;
}

const check = <T>(r: { data: T; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

function supabaseApi(sb: SupabaseClient): Api {
  return {
    demo: false,
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
    },
    async signOut() { await sb.auth.signOut(); },
    async me() {
      const { data } = await sb.auth.getSession();
      if (!data.session) return null;
      const r = await sb.from("profiles").select("id, role, full_name, phone, email").eq("id", data.session.user.id).maybeSingle();
      return check(r) as Profile | null;
    },
    onOrdersChange(cb) {
      const ch = sb.channel("orders-admin-" + Math.random().toString(36).slice(2))
        .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => cb())
        .subscribe();
      return () => { sb.removeChannel(ch); };
    },

    async cities() { return check(await sb.from("cities").select("*").order("sort")) as City[]; },
    async classes() { return check(await sb.from("car_classes").select("*").order("sort")) as CarClass[]; },

    async orders(f) {
      let q = sb.from("orders")
        .select("*, driver:drivers(profile:profiles(full_name, phone)), car:cars(make, model, plate, color)")
        .order("pickup_at", { ascending: true }).limit(500);
      if (f.city) q = q.eq("city_id", f.city);
      if (f.status === "active") q = q.in("status", ACTIVE_STATUSES);
      else if (f.status && f.status !== "all") q = q.eq("status", f.status);
      if (f.from) q = q.gte("pickup_at", dayStartIso(f.from));
      if (f.to) q = q.lt("pickup_at", new Date(new Date(dayStartIso(f.to)).getTime() + 864e5).toISOString());
      if (f.q) {
        const s = f.q.replace(/[,()]/g, " ").trim();
        const num = Number(s.replace(/\D/g, ""));
        q = /^\d{3,6}$/.test(s) ? q.eq("number", num)
          : q.or(`client_name.ilike.%${s}%,client_phone.ilike.%${s.replace(/\D/g, "") || s}%,pickup_address.ilike.%${s}%`);
      }
      return check(await q) as Order[];
    },
    async orderEvents(id) {
      return check(await sb.from("order_events").select("id, status, note, created_at").eq("order_id", id).order("created_at")) as OrderEvent[];
    },
    async createOrder(i) {
      const r = check(await sb.rpc("create_order", {
        p_city: i.city, p_class: i.car_class, p_type: i.type, p_pickup_at: i.pickup_at,
        p_pickup_address: i.pickup_address, p_client_name: i.client_name, p_client_phone: i.client_phone,
        p_dropoff_address: i.dropoff_address || null, p_tariff: i.tariff ?? null, p_hours: i.hours ?? null,
        p_distance_km: i.distance_km ?? null, p_passengers: i.passengers, p_luggage: i.luggage,
        p_flight_number: i.flight_number || null, p_sign_text: i.sign_text || null, p_child_seat: i.child_seat,
        p_comment: i.comment || null, p_payment_method: i.payment_method, p_company: i.company ?? null,
        p_price_override: i.price_override ?? null,
      })) as { id: string; number: number };
      return r;
    },
    async quote(i) {
      return check(await sb.rpc("calc_price", {
        p_city: i.city, p_class: i.car_class, p_type: i.type, p_tariff: i.tariff ?? null,
        p_hours: i.hours ?? null, p_distance_km: i.distance_km ?? null, p_company: i.company ?? null,
      })) as number | null;
    },
    async updateOrder(id, patch) { check(await sb.from("orders").update(patch).eq("id", id)); },
    async assign(o, d, c) { check(await sb.rpc("assign_driver", { p_order: o, p_driver: d, p_car: c })); },
    async setStatus(o, s, reason) { check(await sb.rpc("staff_set_status", { p_order: o, p_status: s, p_reason: reason ?? null })); },

    async drivers() {
      return check(await sb.from("drivers")
        .select("*, profile:profiles(full_name, phone, email), cars(*)").order("created_at")) as Driver[];
    },
    async createDriver(i) {
      const { data, error } = await sb.functions.invoke("admin-create-user", { body: { ...i, role: "driver" } });
      if (error) {
        let msg = error.message;
        try { msg = (await (error as { context?: Response }).context?.json())?.error || msg; } catch { /* ответ без JSON */ }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
    },
    async updateDriver(id, patch) { check(await sb.from("drivers").update(patch).eq("id", id)); },
    async saveCar(c) {
      const { id, ...rest } = c;
      check(id ? await sb.from("cars").update(rest).eq("id", id) : await sb.from("cars").insert(rest));
    },

    async tariffs(city) { return check(await sb.from("tariffs").select("*").eq("city_id", city).order("sort").order("car_class_id")) as Tariff[]; },
    async saveTariff(t) {
      const { id, ...rest } = t;
      check(id ? await sb.from("tariffs").update(rest).eq("id", id) : await sb.from("tariffs").insert(rest));
    },
    async rates(city) { return check(await sb.from("class_rates").select("*").eq("city_id", city)) as ClassRate[]; },
    async saveRate(r) { check(await sb.from("class_rates").upsert(r)); },

    async companies() { return check(await sb.from("companies").select("*").order("name")) as Company[]; },
    async saveCompany(c) {
      const { id, ...rest } = c;
      check(id ? await sb.from("companies").update(rest).eq("id", id) : await sb.from("companies").insert(rest));
    },
  };
}

const env = import.meta.env;
export const configured = Boolean(env.VITE_DEMO === "1" || (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY));

export const api: Api = env.VITE_DEMO === "1"
  ? demoApi()
  : supabaseApi(createClient(env.VITE_SUPABASE_URL || "http://localhost", env.VITE_SUPABASE_ANON_KEY || "missing"));
