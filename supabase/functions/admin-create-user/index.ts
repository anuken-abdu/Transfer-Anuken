// Edge Function: создание аккаунта водителя или диспетчера из админки.
// Создавать пользователей можно только сервисным ключом, поэтому это делается на сервере.
// Деплой: supabase functions deploy admin-create-user
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function normalizePhone(p: string): string | null {
  let d = (p || "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("8")) d = "7" + d.slice(1);
  if (d.length === 10) d = "7" + d;
  return /^7\d{10}$/.test(d) ? "+" + d : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // кто вызывает
  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const { data: caller, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !caller?.user) return json({ error: "Нужно войти в админку" }, 401);
  const { data: callerProfile } = await admin.from("profiles").select("role").eq("id", caller.user.id).single();
  if (!callerProfile || !["admin", "dispatcher"].includes(callerProfile.role)) {
    return json({ error: "Недостаточно прав" }, 403);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Неверный запрос" }, 400); }

  const role = String(body.role || "driver");
  if (!["driver", "dispatcher"].includes(role)) return json({ error: "Недопустимая роль" }, 400);
  if (role === "dispatcher" && callerProfile.role !== "admin") {
    return json({ error: "Диспетчера может добавить только администратор" }, 403);
  }

  const fullName = String(body.full_name || "").trim();
  const phone = normalizePhone(String(body.phone || ""));
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const cityId = Number(body.city_id);
  const commission = body.commission_pct === undefined ? 20 : Number(body.commission_pct);

  if (fullName.length < 2) return json({ error: "Укажите ФИО" }, 400);
  if (!phone) return json({ error: "Неверный номер телефона" }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Неверный email" }, 400);
  if (password.length < 8) return json({ error: "Пароль минимум 8 символов" }, 400);
  if (role === "driver" && !(cityId > 0)) return json({ error: "Укажите город" }, 400);
  if (!(commission >= 0 && commission <= 100)) return json({ error: "Комиссия от 0 до 100%" }, 400);

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password, phone, email_confirm: true, phone_confirm: true,
    user_metadata: { full_name: fullName, phone },
  });
  if (createErr || !created.user) {
    const msg = createErr?.message?.includes("already") ? "Пользователь с таким email или телефоном уже есть" : createErr?.message;
    return json({ error: msg || "Не удалось создать пользователя" }, 400);
  }
  const uid = created.user.id;

  const { error: profErr } = await admin.from("profiles")
    .update({ role, full_name: fullName, phone, city_id: cityId > 0 ? cityId : null })
    .eq("id", uid);
  if (profErr) {
    await admin.auth.admin.deleteUser(uid);
    return json({ error: profErr.message }, 400);
  }

  if (role === "driver") {
    const { error: drvErr } = await admin.from("drivers").insert({
      id: uid, city_id: cityId, commission_pct: commission,
      languages: Array.isArray(body.languages) && body.languages.length ? body.languages : ["ru"],
      note: body.note ? String(body.note) : null,
    });
    if (drvErr) {
      await admin.auth.admin.deleteUser(uid);
      return json({ error: drvErr.message }, 400);
    }
  }

  return json({ id: uid });
});
