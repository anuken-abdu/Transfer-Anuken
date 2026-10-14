export type OrderType = "transfer" | "hourly" | "intercity";
export type OrderStatus =
  | "new" | "confirmed" | "assigned" | "en_route" | "arrived" | "in_progress" | "completed" | "cancelled";
export type PaymentMethod = "cash" | "kaspi" | "card" | "invoice";

export interface City { id: number; slug: string; name_ru: string; name_en: string; sort: number }
export interface CarClass {
  id: number; code: string; name_ru: string; name_en: string; seats: number; luggage: number;
  description_ru: string | null; sort: number;
}
export interface Tariff {
  id: number; city_id: number; car_class_id: number; title_ru: string; title_en: string | null;
  from_label: string; to_label: string; price: number; sort: number;
}
export interface ClassRate { city_id: number; car_class_id: number; hourly_price: number; min_hours: number; intercity_km_price: number }

export interface BookingInput {
  city: number; car_class: number; type: OrderType; pickup_at: string;
  pickup_address: string; dropoff_address?: string; tariff?: number | null; hours?: number | null;
  client_name: string; client_phone: string; passengers: number; luggage: number;
  flight_number?: string; sign_text?: string; child_seat: boolean; comment?: string; payment_method: PaymentMethod;
}
export interface BookingResult { id: string; number: number; price: number | null; status: OrderStatus; tracking_token: string }

/** Ответ track_order */
export interface Tracking {
  number: number; status: OrderStatus; type: OrderType; hours: number | null;
  pickup_at: string; pickup_address: string; dropoff_address: string | null; passengers: number;
  price: number | null; payment_method: PaymentMethod; car_class: string; car_class_en: string;
  city_slug: string; city: string; cancel_reason: string | null; can_cancel: boolean;
  driver: { name: string; phone: string | null; car: string; plate: string; lat: number | null; lng: number | null; seen_at: string | null } | null;
}
