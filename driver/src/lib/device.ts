// Возможности телефона: геопозиция, экран не гаснет, звук и вибрация о новом заказе.
// Всё обёрнуто в try/catch: на некоторых телефонах и в превью эти функции недоступны.
import { useEffect, useRef } from "react";
import { api } from "./api";

/** Отправляет координаты, пока водитель на линии и приложение открыто: раз в 30 с или при сдвиге на 150 м */
export function useLocationPing(enabled: boolean, onError: (msg: string) => void) {
  const last = useRef<{ t: number; lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (!enabled || !("geolocation" in navigator)) return;
    let id: number | null = null;
    try {
      id = navigator.geolocation.watchPosition(
        (p) => {
          const { latitude: lat, longitude: lng } = p.coords;
          const prev = last.current;
          const moved = prev ? distM(prev.lat, prev.lng, lat, lng) : Infinity;
          if (prev && Date.now() - prev.t < 30_000 && moved < 150) return;
          last.current = { t: Date.now(), lat, lng };
          api.ping(lat, lng).catch(() => { /* следующая попытка через 30 с */ });
        },
        (e) => { if (e.code === e.PERMISSION_DENIED) onError("Разрешите доступ к геопозиции — диспетчер и клиент видят, где машина"); },
        { enableHighAccuracy: true, maximumAge: 15_000, timeout: 30_000 },
      );
    } catch { /* геопозиция недоступна */ }
    return () => { if (id !== null) navigator.geolocation.clearWatch(id); };
  }, [enabled, onError]);
}

function distM(a: number, b: number, c: number, d: number) {
  const R = 6371e3, r = Math.PI / 180;
  const x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Экран не гаснет, пока идёт заказ */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    type WL = { release: () => Promise<void> };
    let lock: WL | null = null;
    let stopped = false;
    const req = async () => {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WL> } };
        if (nav.wakeLock && document.visibilityState === "visible") lock = await nav.wakeLock.request("screen");
        if (stopped && lock) lock.release().catch(() => {});
      } catch { /* не поддерживается */ }
    };
    req();
    const onVis = () => document.visibilityState === "visible" && req();
    document.addEventListener("visibilitychange", onVis);
    return () => { stopped = true; document.removeEventListener("visibilitychange", onVis); lock?.release().catch(() => {}); };
  }, [active]);
}

let audio: AudioContext | null = null;
/** Вызвать из обработчика нажатия (например «Выйти на линию»), чтобы браузер разрешил звук */
export function unlockSound() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audio ??= new AC();
    if (audio.state === "suspended") audio.resume().catch(() => {});
  } catch { /* нет звука */ }
}

/** Сигнал о новом заказе: два тона, вибрация, системное уведомление (если разрешено и приложение свёрнуто) */
export function alertNewOrder(text: string) {
  try {
    if (audio && audio.state === "running") {
      const t = audio.currentTime;
      [880, 1175].forEach((f, i) => {
        const o = audio!.createOscillator(), g = audio!.createGain();
        o.frequency.value = f; o.type = "sine";
        g.gain.setValueAtTime(0.0001, t + i * 0.22);
        g.gain.exponentialRampToValueAtTime(0.35, t + i * 0.22 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.22 + 0.2);
        o.connect(g).connect(audio!.destination); o.start(t + i * 0.22); o.stop(t + i * 0.22 + 0.22);
      });
    }
  } catch { /* без звука */ }
  try { navigator.vibrate?.([200, 100, 200]); } catch { /* без вибрации */ }
  try {
    if ("Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") {
      const show = (r?: ServiceWorkerRegistration) => {
        if (r) r.showNotification("Anuken Transfer", { body: text, icon: "/icon-192.png", tag: "order" }).catch(() => {});
        else new Notification("Anuken Transfer", { body: text });
      };
      if (navigator.serviceWorker) navigator.serviceWorker.getRegistration().then(show).catch(() => show());
      else show();
    }
  } catch { /* уведомления недоступны */ }
}

export async function askNotifications(): Promise<"granted" | "denied" | "default" | "unsupported"> {
  try {
    if (!("Notification" in window)) return "unsupported";
    if (Notification.permission !== "default") return Notification.permission;
    return await Notification.requestPermission();
  } catch { return "unsupported"; }
}
export const notificationState = (): "granted" | "denied" | "default" | "unsupported" => {
  try { return "Notification" in window ? Notification.permission : "unsupported"; } catch { return "unsupported"; }
};

export const isStandalone = () => {
  try {
    return window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  } catch { return false; }
};
export const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);
