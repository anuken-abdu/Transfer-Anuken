export type OrderType = "transfer" | "hourly" | "intercity";
export type OrderStatus =
  | "new" | "confirmed" | "assigned" | "en_route" | "arrived" | "in_progress" | "completed" | "cancelled";
export type PaymentMethod = "cash" | "kaspi" | "card" | "invoice";
export type DriverState = "offline" | "online" | "busy";

/** Строка из представления public.driver_orders */
export interface DriverOrder {
  id: string; number: number; status: OrderStatus; type: OrderType; pickup_at: string;
  pickup_address: string; pickup_lat: number | null; pickup_lng: number | null;
  dropoff_address: string | null; dropoff_lat: number | null; dropoff_lng: number | null;
  hours: number | null; passengers: number; luggage: number; flight_number: string | null;
  sign_text: string | null; child_seat: boolean; comment: string | null;
  client_name: string; client_phone: string; driver_payout: number | null;
  payment_method: PaymentMethod; payment_status: "unpaid" | "paid" | "refunded";
  car_id: number | null; city_id: number; car_class_id: number;
  /** полная сумма заказа — для оплаты наличными */
  price: number | null;
}

export interface Me {
  id: string;
  full_name: string | null;
  phone: string | null;
  state: DriverState;
  is_active: boolean;
  commission_pct: number;
  rating: number;
  city: { id: number; slug: string; name_ru: string } | null;
  cars: { id: number; make: string; model: string; plate: string; color: string | null; car_class_id: number; is_active: boolean }[];
}

export interface CarClass { id: number; name_ru: string }
