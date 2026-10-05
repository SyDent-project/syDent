// ════════════════════════════════════════════════════════════════════════
// SyDent E2E — api.mjs · إنشاء/كنس بيانات الاختبار عبر PostgREST
// ════════════════════════════════════════════════════════════════════════
// قرار معماري: التنظيف **لا** يعتمد على واجهة الحذف — لو فشل اختبار بالنصّ
// تتراكم بيانات وسخة بالمستأجر للأبد (وترقيم المرضى ذرّي لا يُعاد استخدامه).
// لذلك كل اختبار ينظّف عبر الـAPI بـ**جلسة المستأجر نفسها** (access_token من
// global-setup) — **لا service_role**: RLS هي الحارس، وصلاحية الاختبار =
// صلاحية العيادة بالضبط، صفر تصعيد امتيازات (يتّسق مع Rule #123).
//
// كل كيان يُنشأ باسم مسبوق بـ E2E_PREFIX فيمكن كنس البقايا بيقين.
// ════════════════════════════════════════════════════════════════════════

export const E2E_PREFIX = 'E2E-';

/** اسم فريد لكل تشغيلة: E2E-<label>-<طابع> */
export function e2eName(label) {
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return E2E_PREFIX + String(label || 'x') + '-' + stamp;
}

/** رقم هاتف اختباري ثابت الشكل (تحقّق patients يتطلب هاتفاً). */
export function e2ePhone() {
  return '09' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
}

/** تاريخ محلي YYYY-MM-DD بإزاحة أيام — مرآة دلالية لـ ppYmdLocal/prmYmdLocal. */
export function ymdLocal(offsetDays, base) {
  const d = base instanceof Date ? new Date(base.getTime()) : new Date();
  d.setDate(d.getDate() + (Number(offsetDays) || 0));
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/**
 * ترتيب الحذف إلزامي: الأبناء قبل الآباء (قيود FK).
 * appointments.patient_id → patients.id، فالمواعيد تُحذف أولاً دائماً.
 */
export function cleanupOrder() {
  return ['appointments', 'patients'];
}

/**
 * ب٢-ب: الجداول المالية بلا عمود اسم — تُكنس بمعرّفات مرضى E2E المجلوبة أولاً.
 * ترتيب الحذف إلزامي (FK): payment_splits يشير لـledger_payments وledger_sessions،
 * فيُحذف أولاً، ثم الدفعات فالجلسات — كلها قبل appointments/patients.
 */
export function financialCleanupOrder() {
  return ['payment_splits', 'ledger_payments', 'ledger_sessions'];
}

/** مسار حذف مالي مقيّد بالمالك + قائمة معرّفات مرضى الاختبار معاً (حزام وحمّالة). */
export function buildFinancialSweepPath(table, ownerId, patientIds) {
  if (!table || !ownerId) throw new Error('buildFinancialSweepPath: table and ownerId required');
  if (!Array.isArray(patientIds) || patientIds.length === 0) return null;
  const list = patientIds.map((id) => encodeURIComponent(id)).join(',');
  return '/rest/v1/' + table +
         '?doctor_id=eq.' + encodeURIComponent(ownerId) +
         '&patient_id=in.(' + list + ')';
}

/**
 * يبني مسار PostgREST للحذف: يقيّد بالمالك **و** ببادئة الاختبار معاً.
 * التقييد المزدوج حزام وحمّالة: RLS تمنع تجاوز المستأجر، والبادئة تمنع
 * لمس أي صف حقيقي داخله.
 */
export function buildSweepPath(table, ownerId, column) {
  if (!table || !ownerId) throw new Error('buildSweepPath: table and ownerId required');
  const col = column || (table === 'appointments' ? 'patient_name' : 'name');
  return '/rest/v1/' + table +
         '?doctor_id=eq.' + encodeURIComponent(ownerId) +
         '&' + col + '=like.' + encodeURIComponent(E2E_PREFIX + '*');
}

/** مهلة قصوى لكل نداء API. بلاها يبتلع نداءٌ عالق ميزانية الاختبار كلها
 *  ويُنتج «Test timeout» أعمى بلا أي تشخيص — هذا ما حدث فعلاً بالجولة الأولى. */
export const API_TIMEOUT_MS = 10_000;

/** عميل REST خفيف مقيّد بجلسة المستأجر (بلا تبعيات). */
export function makeApi(cfg) {
  const base = String(cfg.url).replace(/\/+$/, '');
  const headers = {
    apikey: cfg.anonKey,
    Authorization: 'Bearer ' + cfg.accessToken,
    'Content-Type': 'application/json'
  };

  async function req(method, path, body, extraHeaders) {
    // تسجيل صاخب لكل نداء (نفس مبدأ #310): الحالة والزمن يُقالان دائماً،
    // فأي تعليق أو رفض مستقبلي يشرح نفسه بسطر واحد بدل مهلة عمياء.
    const t0 = Date.now();
    let res;
    try {
      res = await fetch(base + path, {
        method,
        headers: Object.assign({}, headers, extraHeaders || {}),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(API_TIMEOUT_MS)
      });
    } catch (e) {
      const ms = Date.now() - t0;
      const why = (e && e.name === 'TimeoutError')
        ? `TIMED OUT after ${API_TIMEOUT_MS}ms`
        : `network error: ${e && e.message}`;
      console.log(`E2E api ${method} ${path} → ✗ ${why} (${ms}ms)`);
      throw new Error(`E2E api ${method} ${path}: ${why}`);
    }
    const ms = Date.now() - t0;
    const text = await res.text();
    console.log(`E2E api ${method} ${path} → HTTP ${res.status} (${ms}ms)`);
    if (!res.ok) throw new Error(`E2E api ${method} ${path}: HTTP ${res.status} — ${text.slice(0, 200)}`);
    try { return JSON.parse(text); } catch { return null; }
  }

  return {
    ownerId: cfg.ownerId,

    /**
     * ينشئ مريض اختبار. local_id يُولَّد بالـRPC الذرّي — لا يُستورَد (Rule #62).
     * ⚠️ اسم البارامتر `n` **متحقَّق من الكود الحي** لا مُخمَّن:
     *    migrations/86 → next_patient_seq(n integer DEFAULT 1)
     *    patients.html:1270 → rpc('next_patient_seq', { n: 1 })
     * (الجولة الأولى استعملت `p_n` المخترَع ففشلت بـ2.4s — خرق Rule #19.)
     */
    async createPatient(name) {
      const seq = await req('POST', '/rest/v1/rpc/next_patient_seq', { n: 1 });
      const n = Array.isArray(seq) ? seq[0] : seq;
      const localId = 'P' + String(n).padStart(3, '0');
      const rows = await req('POST', '/rest/v1/patients', {
        doctor_id: cfg.ownerId,
        local_id: localId,
        name: name,
        phone: e2ePhone(),
        dob: null, gender: '', payment: 'متبقي', status: 'جديد',
        allergies: '', notes: '', last_visit: ymdLocal(0)
      }, { Prefer: 'return=representation' });
      return Array.isArray(rows) ? rows[0] : rows;
    },

    /**
     * يكنس كل بقايا الاختبار بالترتيب الآمن.
     * لا يُفشل اختباراً (التنظيف ليس موضوع الاختبار) لكنه **يصرّح** بكل فشل —
     * ابتلاع الأخطاء صامتاً هو ما جعل الجولة الأولى بلا تشخيص.
     */
    async sweep(tag) {
      const label = tag ? `sweep[${tag}]` : 'sweep';
      // ب٢-ب: الصفوف المالية أولاً — تُحدَّد عبر معرّفات مرضى E2E- (لا عمود اسم
      // بالجداول المالية). فشل الجلب لا يوقف الكنس الاسمي القديم.
      try {
        const pats = await req('GET', '/rest/v1/patients?select=id' +
          '&doctor_id=eq.' + encodeURIComponent(cfg.ownerId) +
          '&name=like.' + encodeURIComponent(E2E_PREFIX + '*'));
        const ids = (Array.isArray(pats) ? pats : []).map((p) => p && p.id).filter(Boolean);
        for (const table of financialCleanupOrder()) {
          const path = buildFinancialSweepPath(table, cfg.ownerId, ids);
          if (!path) break; // صفر مرضى اختبار = صفر صفوف مالية بالتعريف
          try {
            await req('DELETE', path);
          } catch (e) {
            console.log(`E2E ${label}: ✗ ${table} — ${e && e.message}`);
          }
        }
      } catch (e) {
        console.log(`E2E ${label}: ✗ patients-lookup — ${e && e.message}`);
      }
      for (const table of cleanupOrder()) {
        try {
          await req('DELETE', buildSweepPath(table, cfg.ownerId));
        } catch (e) {
          console.log(`E2E ${label}: ✗ ${table} — ${e && e.message}`);
        }
      }
      console.log(`E2E ${label}: done`);
    },

    /** قراءة صفوف جدول لمريض واحد (لتوكيدات الحقيقة المالية بالـDB). */
    async listByPatient(table, patientId, select) {
      const rows = await req('GET', '/rest/v1/' + table +
        '?select=' + encodeURIComponent(select || '*') +
        '&doctor_id=eq.' + encodeURIComponent(cfg.ownerId) +
        '&patient_id=eq.' + encodeURIComponent(patientId));
      return Array.isArray(rows) ? rows : [];
    },

    async deleteById(table, id) {
      try {
        await req('DELETE', '/rest/v1/' + table +
          '?id=eq.' + encodeURIComponent(id) +
          '&doctor_id=eq.' + encodeURIComponent(cfg.ownerId));
      } catch (e) { console.log('E2E deleteById skipped: ' + (e && e.message)); }
    }
  };
}
