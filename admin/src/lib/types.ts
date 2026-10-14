export type Role = "admin" | "dispatcher" | "driver" | "client";
export type OrderType = "transfer" | "hourly" | "intercity";
export type OrderStatus =
  | "new" | "confirmed" | "assigned" | "en_route" | "arrived" | "in_progress" | "completed" | "cancelled";
export type PaymentMethod = "cash" | "kaspi" | "card" | "invoice";
export type PaymentStatus = "unpaid" | "paid" | "refunded";
export type DriverState = "offline" | "online" | "busy";

export interface City { id: number; slug: string; name_ru: string; is_active: boolean; sort: number }
export interface CarClass {
  id: number; code: string; name_ru: string; seats: number; luggage: number;
  description_ru: string | null; is_active: boolean; sort: number;
}
export interface Tariff {
  id: number; city_id: number; car_class_id: number; title_ru: string;
  from_label: string; to_label: string; price: number; is_active: boolean; sort: number;
}
export interface ClassRate {
  city_id: number; car_class_id: number; hourly_price: number; min_hours: number; intercity_km_price: number;
}
export interface Company {
  id: number; name: string; bin: string | null; contact_name: string | null; contact_phone: string | null;
  email: string | null; discount_pct: number; is_active: boolean; note: string | null;
}
export interface Profile {
  id: string; role: Role; full_name: string | null; phone: string | null; email: string | null;
}
export interface Car {
  id: number; driver_id: string; car_class_id: number; make: string; model: string;
  year: number | null; color: string | null; plate: string; seats: number; is_active: boolean;
}
export interface Driver {
  id: string; city_id: number; state: DriverState; is_active: boolean; commission_pct: number;
  rating: number; languages: string[]; note: string | null; last_seen_at: string | null;
  profile: { full_name: string | null; phone: string | null; email: string | null } | null;
  cars: Car[];
}
export interface Order {
  id: string; number: number; source: "web" | "app" | "admin" | "phone";
  type: OrderType; status: OrderStatus; city_id: number; car_class_id: number; tariff_id: number | null;
  company_id: number | null; client_name: string; client_phone: string;
  pickup_at: string; pickup_address: string; dropoff_address: string | null; hours: number | null;
  passengers: number; luggage: number; flight_number: string | null; sign_text: string | null;
  child_seat: boolean; comment: string | null; price: number | null; driver_payout: number | null;
  payment_method: PaymentMethod; payment_status: PaymentStatus; driver_id: string | null; car_id: number | null;
  cancel_reason: string | null; internal_note: string | null; created_at: string; tracking_token: string;
  driver?: { profile: { full_name: string | null; phone: string | null } | null } | null;
  car?: { make: string; model: string; plate: string; color: string | null } | null;
}
export interface OrderEvent { id: number; status: OrderStatus; note: string | null; created_at: string }

export interface NewOrderInput {
  city: number; car_class: number; type: OrderType; pickup_at: string; pickup_address: string;
  dropoff_address?: string; tariff?: number | null; hours?: number | null; distance_km?: number | null;
  client_name: string; client_phone: string; passengers: number; luggage: number;
  flight_number?: string; sign_text?: string; child_seat: boolean; comment?: string;
  payment_method: PaymentMethod; company?: number | null; price_override?: number | null;
}
export interface NewDriverInput {
  full_name: string; phone: string; email: string; password: string; city_id: number; commission_pct: number;
}
export interface OrderFilter { city?: number; status?: OrderStatus | "active" | "all"; from?: string; to?: string; q?: string }
