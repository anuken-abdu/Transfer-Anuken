import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { BookingInput, BookingResult, CarClass, City, ClassRate, Tariff, Tracking } from "./types";
import { demoApi } from "./demo";

export interface Api {
  demo: boolean;
  cities(): Promise<City[]>;
  classes(): Promise<CarClass[]>;
  tariffs(city: number): Promise<Tariff[]>;
  rates(city: number): Promise<ClassRate[]>;
  book(i: BookingInput): Promise<BookingResult>;
  track(token: string): Promise<Tracking | null>;
  cancel(token: string, reason: string): Promise<void>;
}

const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message); };

function supabaseApi(sb: SupabaseClient): Api {
  return {
    demo: false,
    async cities() { const r = await sb.from("cities").select("id, slug, name_ru, name_en, sort").order("sort"); fail(r.error); return r.data as City[]; },
    async classes() { const r = await sb.from("car_classes").select("id, code, name_ru, name_en, seats, luggage, description_ru, sort").order("sort"); fail(r.error); return r.data as CarClass[]; },
    async tariffs(city) { const r = await sb.from("tariffs").select("id, city_id, car_class_id, title_ru, title_en, from_label, to_label, price, sort").eq("city_id", city).order("sort"); fail(r.error); return r.data as Tariff[]; },
    async rates(city) { const r = await sb.from("class_rates").select("*").eq("city_id", city); fail(r.error); return r.data as ClassRate[]; },
    async book(i) {
      const r = await sb.rpc("create_order", {
        p_city: i.city, p_class: i.car_class, p_type: i.type, p_pickup_at: i.pickup_at,
        p_pickup_address: i.pickup_address, p_client_name: i.client_name, p_client_phone: i.client_phone,
        p_dropoff_address: i.dropoff_address || null, p_tariff: i.tariff ?? null, p_hours: i.hours ?? null,
        p_passengers: i.passengers, p_luggage: i.luggage, p_flight_number: i.flight_number || null,
        p_sign_text: i.sign_text || null, p_child_seat: i.child_seat, p_comment: i.comment || null,
        p_payment_method: i.payment_method,
      });
      fail(r.error); return r.data as BookingResult;
    },
    async track(token) {
      if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
      const r = await sb.rpc("track_order", { p_token: token }); fail(r.error); return (r.data as Tracking) ?? null;
    },
    async cancel(token, reason) { const r = await sb.rpc("cancel_by_token", { p_token: token, p_reason: reason || null }); fail(r.error); },
  };
}

const env = import.meta.env;
export const configured = Boolean(env.VITE_DEMO === "1" || (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY));
export const trackUrl = (token: string) =>
  env.VITE_DEMO === "1" ? `${location.href.split("#")[0]}#t-${token}` : `${location.origin}/t/${token}`;
export const DISPATCH_PHONE = (env.VITE_DISPATCH_PHONE as string | undefined) || "";
export const api: Api = env.VITE_DEMO === "1"
  ? demoApi()
  : supabaseApi(createClient(env.VITE_SUPABASE_URL || "http://localhost", env.VITE_SUPABASE_ANON_KEY || "missing", {
      auth: { persistSession: false, autoRefreshToken: false },
    }));
