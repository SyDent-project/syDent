// ════════════════════════════════════════════════════════════════════
// bridge — خدمةُ «SyDent Bridge» (ربط الأجهزة ٢ · M194 · v643)
//
// الجهةُ المنادية: برنامجٌ صغير على كمبيوتر العيادة بلا جلسة مستخدم. هويتُه مفتاحُ جهاز (64 hex) يُولَّد هنا مرةً
// عند الاقتران ولا يُخزَّن بالقاعدة إلا SHA-256 له (bridge_devices.key_hash). كلُّ طلبٍ بعدها يحمل device_id + key.
// الإجراءات (POST JSON · action):
//   pair      {code, version?, mode?}                 ← رمزُ الاقتران من الإعدادات (8 أحرف · 10 دقائق · مرةٌ واحدة)
//   poll      {device_id, key, version?}              → الطلباتُ المفتوحة لعيادة الجهاز (المريض · الأسنان · النوع)
//   upload    {device_id, key, request_id?, mime, name, size} → مسارٌ مسموح (مجلدُ المريض لطلبٍ مفتوح، وإلا _inbox)
//                                                        + رابطُ رفعٍ موقّع (PUT مباشر إلى Storage، حتى 30MB)
//   complete  {device_id, key, request_id?, path, name, mime, size} → صفُّ المريض (عبر حرّاس M192) أو صفُّ الوارد
// البوابات كلُّها بالقاعدة (bridge_* لمفتاح الخدمة فقط): اشتراكُ العيادة full · الحصّة · الصيغ · المسارُ داخل مجلد المالك.
// verify_jwt=false (supabase/config.toml) والتحقّقُ هنا: المفتاحُ هو الهوية. مفتاحُ الخدمة من Deno.env فقط.
// ════════════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MIMES = ["image/jpeg", "image/png", "image/webp", "application/dicom"];
const MAX_BYTES = 31457280;
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
function hex(buf: ArrayBuffer): string { return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join(""); }
async function sha256(s: string): Promise<string> { return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))); }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { ok: false, reason: "method" });
  let b: Record<string, unknown>;
  try { b = await req.json(); if (!b || typeof b !== "object") throw new Error("x"); } catch (_e) { return json(400, { ok: false, reason: "bad_request" }); }
  const action = String(b.action || "");
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json(500, { ok: false, reason: "config" });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const version = typeof b.version === "string" ? b.version.slice(0, 40) : null;

  if (action === "pair") {
    const code = String(b.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) return json(200, { ok: false, reason: "bad_code" });
    const deviceKey = hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
    const r = await admin.rpc("bridge_pair", { p_code: code, p_key_hash: await sha256(deviceKey), p_version: version, p_mode: typeof b.mode === "string" ? b.mode : "folder" });
    if (r.error) return json(500, { ok: false, reason: "server" });
    const out = r.data || {};
    if (!out.ok) return json(200, { ok: false, reason: out.reason === "subscription" ? "subscription" : "bad_code" });
    return json(200, { ok: true, device_id: out.device_id, key: deviceKey, device_name: out.device_name });
  }

  // كلُّ ما بعد الاقتران يحتاج هويةَ الجهاز
  const deviceId = String(b.device_id || ""), deviceKey = String(b.key || "");
  if (!UUID.test(deviceId) || !/^[0-9a-f]{64}$/.test(deviceKey)) return json(401, { ok: false, reason: "unauthorized" });
  const auth = await admin.rpc("bridge_auth", { p_device: deviceId, p_key_hash: await sha256(deviceKey), p_version: version });
  if (auth.error) return json(500, { ok: false, reason: "server" });
  const owner = auth.data as string | null;
  if (!owner) return json(401, { ok: false, reason: "unauthorized" });

  if (action === "poll") {
    const r = await admin.rpc("bridge_open_requests", { p_owner: owner });
    if (r.error) return json(500, { ok: false, reason: "server" });
    return json(200, { ok: true, now: new Date().toISOString(), requests: Array.isArray(r.data) ? r.data : [] });
  }

  if (action === "upload") {
    const mime = String(b.mime || ""), name = String(b.name || "capture").slice(0, 200), size = Number(b.size || 0);
    if (MIMES.indexOf(mime) < 0) return json(200, { ok: false, reason: "type" });
    if (!(size > 0) || size > MAX_BYTES) return json(200, { ok: false, reason: "size" });
    const reqId = typeof b.request_id === "string" && UUID.test(b.request_id) ? b.request_id : null;
    const p = await admin.rpc("bridge_upload_path", { p_owner: owner, p_request: reqId, p_mime: mime, p_name: name });
    if (p.error) return json(500, { ok: false, reason: "server" });
    const out = p.data || {};
    if (!out.ok) return json(200, { ok: false, reason: out.reason || "refused" });
    const s = await admin.storage.from("patient-files").createSignedUploadUrl(out.path);
    if (s.error || !s.data) return json(500, { ok: false, reason: "sign" });
    return json(200, { ok: true, path: out.path, request_id: out.request_id || null, url: s.data.signedUrl, token: s.data.token, mime });
  }

  if (action === "complete") {
    const mime = String(b.mime || ""), name = String(b.name || "capture").slice(0, 200), size = Number(b.size || 0), path = String(b.path || "");
    if (MIMES.indexOf(mime) < 0) return json(200, { ok: false, reason: "type" });
    if (!path.startsWith(owner + "/") || path.indexOf("..") > -1) return json(200, { ok: false, reason: "path" });
    const reqId = typeof b.request_id === "string" && UUID.test(b.request_id) ? b.request_id : null;
    const r = await admin.rpc("bridge_complete", { p_owner: owner, p_device: deviceId, p_request: reqId, p_path: path, p_name: name, p_mime: mime, p_size: size > 0 ? Math.round(size) : null });
    if (r.error) return json(500, { ok: false, reason: "server" });
    const out = r.data || {};
    if (!out.ok) {
      // صفٌّ رُفض ⇒ لا نترك الكائنَ يتيماً
      try { await admin.storage.from("patient-files").remove([path]); } catch (_e) { /* best effort */ }
      return json(200, { ok: false, reason: out.reason || "refused" });
    }
    return json(200, { ok: true, document_id: out.document_id || null, inbox_id: out.inbox_id || null, patient_id: out.patient_id || null });
  }

  return json(400, { ok: false, reason: "action" });
});
