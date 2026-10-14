// Сигнал диспетчеру о новом заказе с сайта или из приложения: звук + системное уведомление.
// Браузер разрешает звук только после первого нажатия на странице — подключаемся к нему.
let ctx: AudioContext | null = null;

export function armAlerts() {
  const unlock = () => {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx ??= new AC();
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
    } catch { /* без звука */ }
    document.removeEventListener("pointerdown", unlock);
  };
  document.addEventListener("pointerdown", unlock);
}

export function newOrderAlert(text: string) {
  try {
    if (ctx && ctx.state === "running") {
      const t = ctx.currentTime;
      [660, 880, 1175].forEach((f, i) => {
        const o = ctx!.createOscillator(), g = ctx!.createGain();
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + i * 0.18);
        g.gain.exponentialRampToValueAtTime(0.3, t + i * 0.18 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.16);
        o.connect(g).connect(ctx!.destination); o.start(t + i * 0.18); o.stop(t + i * 0.18 + 0.18);
      });
    }
  } catch { /* без звука */ }
  try {
    if ("Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") {
      new Notification("Новый заказ — Anuken Transfer", { body: text, tag: "new-order" });
    }
  } catch { /* уведомления недоступны */ }
}
