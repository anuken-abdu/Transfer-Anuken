import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CarClass, DriverOrder, Me, OrderStatus } from "./types";
import { demoApi } from "./demo";

export interface Api {
  demo: boolean;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  /** null — не вошёл; "not_driver" — аккаунт не водителя */
  me(): Promise<Me | null | "not_driver">;
  classes(): Promise<CarClass[]>;
  setOnline(on: boolean): Promise<void>;
  active(): Promise<DriverOrder[]>;
  history(days: number): Promise<DriverOrder[]>;
  setStatus(id: string, status: OrderStatus): Promise<void>;
  decline(id: string, reason: string): Promise<void>;
  ping(lat: number, lng: number): Promise<void>;
  onChange(driverId: string, cb: () => void): () => void;
}

const ACTIVE: OrderStatus[] = ["assigned", "en_route", "arrived", "in_progress"];

function fail(e: { message: string } | null) { if (e) throw new Error(e.message); }

function supabaseApi(sb: SupabaseClient): Api {
  return {
    demo: false,
    async signIn(email, password) { const { error } = await sb.auth.signInWithPassword({ email, password }); fail(error); },
    async signOut() { await sb.auth.signOut(); },
    async me() {
      const { data: s } = await sb.auth.getSession();
      const uid = s.session?.user.id;
      if (!uid) return null;
      const [p, d, c] = await Promise.all([
        sb.from("profiles").select("full_name, phone").eq("id", uid).maybeSingle(),
        sb.from("drivers").select("state, is_active, commission_pct, rating, city:cities(id, slug, name_ru)").eq("id", uid).maybeSingle(),
        sb.from("cars").select("id, make, model, plate, color, car_class_id, is_active").eq("driver_id", uid).order("id"),
      ]);
      fail(p.error); fail(d.error); fail(c.error);
      if (!d.data) return "not_driver";
      const drv = d.data as unknown as Omit<Me, "id" | "full_name" | "phone" | "cars">;
      return { id: uid, full_name: p.data?.full_name ?? null, phone: p.data?.phone ?? null, ...drv, cars: (c.data ?? []) as Me["cars"] };
    },
    async classes() {
      const { data, error } = await sb.from("car_classes").select("id, name_ru"); fail(error);
      return (data ?? []) as CarClass[];
    },
    async setOnline(on) { const { error } = await sb.rpc("driver_set_online", { p_online: on }); fail(error); },
    async active() {
      const { data, error } = await sb.from("driver_orders").select("*").in("status", ACTIVE).order("pickup_at");
      fail(error); return (data ?? []) as DriverOrder[];
    },
    async history(days) {
      const since = new Date(Date.now() - days * 864e5).toISOString();
      const { data, error } = await sb.from("driver_orders").select("*")
        .in("status", ["completed", "cancelled"]).gte("pickup_at", since).order("pickup_at", { ascending: false }).limit(300);
      fail(error); return (data ?? []) as DriverOrder[];
    },
    async setStatus(id, status) { const { error } = await sb.rpc("driver_set_status", { p_order: id, p_status: status }); fail(error); },
    async decline(id, reason) { const { error } = await sb.rpc("driver_decline", { p_order: id, p_reason: reason }); fail(error); },
    async ping(lat, lng) { const { error } = await sb.rpc("driver_ping", { p_lat: lat, p_lng: lng }); fail(error); },
    onChange(driverId, cb) {
      const ch = sb.channel("driver-" + driverId)
        .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `driver_id=eq.${driverId}` }, () => cb())
        .subscribe();
      return () => { sb.removeChannel(ch); };
    },
  };
}

const env = import.meta.env;
export const configured = Boolean(env.VITE_DEMO === "1" || (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY));
export const api: Api = env.VITE_DEMO === "1"
  ? demoApi()
  : supabaseApi(createClient(env.VITE_SUPABASE_URL || "http://localhost", env.VITE_SUPABASE_ANON_KEY || "missing", {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "anuken-driver-auth" },
    }));
