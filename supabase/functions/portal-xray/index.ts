// ════════════════════════════════════════════════════════════════════
// portal-xray — صورُ الأشعة المشارَكة ببوابة المريض (M193 · v638)
//
// السطح: زائرٌ مجهول يحمل رابطَ بوابته (?t=<64 hex>) — بلا جلسة. Storage لا يوقّع روابطَ إلا لمالكٍ
// مصادَق، لذا تمرّ القراءةُ هنا بمفتاح الخدمة (Deno.env فقط — لا يغادر الخادم):
//   1) portal_xray_list(token) — دالةٌ لا ينفّذها إلا service_role، بنفس بوابات portal_info/portal_slots:
//      رابطٌ صالح غير موقوف ولا منتهٍ لمريضٍ يتبع المالك · العيادةُ مفتوحة (بوابة الاشتراك) ·
//      مفتاحُ «صور الأشعة» بالإعدادات مفعّل · الصورُ التي شاركها الطبيب صورةً صورة فقط (jpeg/png/webp).
//   2) توقيعُ كل مسار 15 دقيقة (createSignedUrls دفعةً واحدة) ⇒ يُعاد للصفحة: الرابط + نوع/تاريخ/أسنان
//      الصورة فقط. المسارُ الداخلي ومعرّفُ المالك لا يُعادان. الأصلُ وحده — التعليقاتُ والمعايرةُ لا تغادر العيادة.
// صفرُ كتابة. verify_jwt=false (supabase/config.toml) والتحقّقُ كلُّه هنا: التوكن هو الهوية، والدالةُ هي البوابة.
// ════════════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SIGN_SECONDS = 900;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { ok: false, reason: "method" });
  let token = "";
  try {
    const body = await req.json();
    token = String((body && body.t) || "").toLowerCase();
  } catch (_e) { return json(400, { ok: false, reason: "bad_request" }); }
  if (!/^[0-9a-f]{64}$/.test(token)) return json(200, { ok: false, reason: "unavailable" });

  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json(500, { ok: false, reason: "config" });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const r = await admin.rpc("portal_xray_list", { p_token: token });
  if (r.error) return json(500, { ok: false, reason: "server" });
  const out = r.data || {};
  if (!out.ok) return json(200, { ok: false, reason: out.reason === "disabled" ? "disabled" : "unavailable" });
  const items: Array<Record<string, unknown>> = Array.isArray(out.items) ? out.items : [];
  if (!items.length) return json(200, { ok: true, items: [] });

  const paths = items.map((i) => String(i.path || ""));
  const s = await admin.storage.from("patient-files").createSignedUrls(paths, SIGN_SECONDS);
  if (s.error || !Array.isArray(s.data)) return json(500, { ok: false, reason: "sign" });
  const byPath: Record<string, string> = {};
  s.data.forEach((d: { path: string | null; signedUrl: string; error: string | null }) => { if (d && d.path && d.signedUrl && !d.error) byPath[d.path] = d.signedUrl; });

  return json(200, {
    ok: true,
    expires_in: SIGN_SECONDS,
    items: items.filter((i) => byPath[String(i.path)]).map((i) => ({
      id: i.id, url: byPath[String(i.path)], kind: i.kind === "xray" ? "xray" : "photo",
      type: typeof i.type === "string" ? i.type : null, date: typeof i.date === "string" ? i.date : null,
      teeth: Array.isArray(i.teeth) ? (i.teeth as unknown[]).map(String).slice(0, 52) : [],
    })),
  });
});
