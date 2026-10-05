// ════════════════════════════════════════════════════════════════════════
// السيناريو ب٢-ب — المالية 🔴 · جلستان → دفعة → الرصيد + توزيع FIFO بالواجهة
// ════════════════════════════════════════════════════════════════════════
// العقود كلها مستخرَجة من الكود الحي (Rule #312):
//   saveSession (12402): typeVal='_other' → type=desc، ويتخطى بنيوياً مودال
//     خصم المواد (12467: typeVal !== '_other') — فلا مودال مفاجئ بالمسار.
//   openSessionModal (14502): يستدعي populateSessionTypes() async غير-awaited
//     ⇒ المودال «ظاهر» قبل جاهزية #sType — يُنتظر على option[value="_other"] (#314).
//   savePayment (12338): insert → reallocatePatientFunds → renders → closeModal؛
//     الحفظ #payModalSaveBtn، والتاريخ يتعبأ بـopenPayModal (14136).
//   renderSessions (11140): يعرض كل الجلسات بلا فلترة (#315) — paidBadge يظهر
//     فقط عند sessPaid>0 وfullyPaid = sessPaid >= cost − 0.5.
//   fmt (3604): toLocaleString('en-US') ⇒ أرقام لاتينية + فواصل , —
//     التوكيد النصي يمرّ عبر مطبّع digitsOf أدناه (يقبل الصيغتين، فيبقى
//     صالحاً لو عاد أي سطح للأرقام الهندية).
//   FIFO (buildFifoSplits 3170): الأقدم بالتاريخ أولاً — جلسة الأمس تُستهلك
//     قبل جلسة اليوم، والحقيقة النهائية تُوكَّد من payment_splits بالـDB
//     بجلسة المستأجر نفسها (صفر service_role).
// ════════════════════════════════════════════════════════════════════════
import { test, expect } from '../fixtures/base';
import { e2eName, ymdLocal } from '../lib/api.mjs';

const COST_A = 50000;   // جلسة الأمس — يستهلكها FIFO كاملة
const COST_B = 30000;   // جلسة اليوم — جزئية
const PAY    = 60000;   // ⇒ A=50k earned + B=10k earned، صفر unearned، متبقٍّ 20k

/** يطبّع مخرجات fmt: ٠-٩→0-9 (احتياطاً) وحذف كل ما ليس رقماً (الفواصل وl.س). */
function digitsOf(text: string): number {
  const AR = '٠١٢٣٤٥٦٧٨٩';
  const ascii = String(text || '').replace(/[٠-٩]/g, (d) => String(AR.indexOf(d)));
  const only = ascii.replace(/[^0-9]/g, '');
  return only ? parseInt(only, 10) : NaN;
}

/** يفتح مودال الجلسة ويحفظ جلسة _other بوصف/كلفة/تاريخ — يعيد عند ظهور صفها. */
async function addSession(page: import('@playwright/test').Page, desc: string, cost: number, date: string) {
  console.log(`E2E step: add session "${desc}" cost=${cost} date=${date}`);
  await page.locator('button:has-text("جلسة جديدة")').first().click();
  // v266: «جلسة جديدة» صار مدخلاً chart-first (newSessionEntryModal) — الجلسة
  // الحرّة (_other) تُفتح من زر «جلسة بلا سن» فيه، وsessionModal لم يتغيّر بعدها.
  await expect(page.locator('#newSessionEntryModal')).toBeVisible({ timeout: 10_000 });
  await page.locator('#newSessionEntryModal [onclick="nseFree()"]').click();
  await expect(page.locator('#sessionModal')).toBeVisible({ timeout: 10_000 });
  // ظاهر ≠ جاهز (#314): populateSessionTypes async غير-awaited — ننتظر خيار
  // _other نفسه (يُلحَق آخر القائمة، فوجوده = اكتملت التعبئة كلها).
  await page.waitForFunction(
    'var s=document.getElementById("sType"); !!(s && s.querySelector("option[value=_other]"))',
    undefined, { timeout: 15_000 }
  );
  // ⚠️ فخ الجولة ١ (نفس صنف درس fStatus بالمواعيد): init() عبّى #sType سلفاً
  // فالانتظار أعلاه ينجح فوراً، لكن openSessionModal يستدعي populateSessionTypes
  // (غير-awaited) التي تمسح innerHTML وتعيد البناء بعد رحلة شبكة — فتدوس أي
  // اختيار سبقها ويرتد الحفظ بـ«اختر نوع العلاج» والمودال يبقى مفتوحاً.
  // حلقة تقارب بفخ استقرار: نختار ثم نتحقق أن القيمة صمدت نافذةً كافية؛
  // التعبئة تجري مرة واحدة لكل فتح، فبعد اكتمالها الاختيار يثبت حتمياً.
  await expect(async () => {
    await page.locator('#sType').selectOption('_other');
    await page.waitForTimeout(600); // نافذة الدوس: يجب أن تصمد القيمة عبرها
    expect(await page.locator('#sType').inputValue(),
      'اختيار _other يجب أن يصمد بعد نافذة إعادة التعبئة').toBe('_other');
  }).toPass({ timeout: 25_000, intervals: [200, 500, 1000] });
  await page.locator('#sDesc').fill(desc);
  await page.locator('#sCost').fill(String(cost));
  await page.locator('#sDate').fill(date);
  // كبسة الحفظ بحلقة محدودة آمنة ضد التكرار: saveSession بلا حارس in-flight،
  // فالنقر الأعمى المتكرر = جلسة مكررة. يُعاد النقر **فقط** عند بصمة ارتداد
  // التحقق (sType انمسح ⇒ «اختر نوع العلاج» ⇒ صفر insert وقع)؛ أما مودال
  // مفتوح والقيمة صامدة = insert/realloc جارٍ ببطء ⇒ يُرمى الخطأ بلا نقرة ثانية.
  let saved = false;
  for (let attempt = 1; attempt <= 3 && !saved; attempt++) {
    if ((await page.locator('#sType').inputValue()) !== '_other') {
      await page.locator('#sType').selectOption('_other');
    }
    await page.locator('#sessionModal [onclick="saveSession()"]').click();
    try {
      // saveSession → realloc → renders → closeModal: الإغلاق دليل اكتمال المسار
      await expect(page.locator('#sessionModal')).toBeHidden({ timeout: 15_000 });
      saved = true;
    } catch (e) {
      const cur = await page.locator('#sType').inputValue();
      console.log(`E2E addSession attempt ${attempt}: modal still open, sType="${cur}"`);
      if (cur === '_other') throw e; // ليس ارتداد تعبئة — فشل حقيقي يُبلَّغ كما هو
    }
  }
  expect(saved, 'حفظ الجلسة اكتمل — المودال أُغلق').toBe(true);
  // ⚠️ فخ الجولة ٢: الصف يُرسَم لكنه داخل لوحة مخفية — `.panel{display:none}`
  // و`#tab-file` وحدها active افتراضياً، وصفوف الجلسات تسكن `#tab-sessions`.
  // داخل هذا المساعد نوكّد **الوجود بالـDOM** (دليل الكتابة + الرندر) بلا
  // تبعية لحالة التبويب؛ التوكيدات المرئية تجري بعد فتح تبويبها صراحةً.
  await expect(
    page.locator(`[data-test="pp-session-row"]:has-text("${desc}")`)
  ).toBeAttached({ timeout: 15_000 });
}

test('٤ — المالية: جلستان ← دفعة ← رصيد وFIFO بالواجهة + حقيقة الـDB', async ({ page, api }) => {
  test.setTimeout(120_000); // مسار أطول من البقية: جلستان + دفعة + realloc ×3
  await api.sweep('before');
  const patientName = e2eName('fin');
  const descA = e2eName('sessA');
  const descB = e2eName('sessB');
  let pid: string | null = null;

  try {
    // المريض عبر الـAPI (دورته مغطاة بالسيناريو ٢ — التركيز هنا مالي بحت)
    console.log('E2E step: create patient via API');
    const pat = await api.createPatient(patientName);
    pid = pat && pat.id;
    expect(pid, 'إنشاء مريض الاختبار').toBeTruthy();

    // فتح البطاقة + انتظار إشارة الصفحة نفسها (#314): لا ready-flag بالصفحة،
    // فالإشارة = patient.id محلول + balanceSummary مرسوم (renderPayments بذيل init
    // يكتبه دائماً حتى بصفر جلسات — بطاقتا المنجز/المدفوع غير مشروطتين).
    console.log('E2E step: open patient profile');
    await page.goto('/patient-profile.html?id=' + pid, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#sbSidebar')).toBeVisible({ timeout: 15_000 });
    await page.waitForFunction(
      'typeof currentUser !== "undefined" && !!currentUser && !!currentUser.id' +
      ' && typeof patient !== "undefined" && !!patient && !!patient.id' +
      ' && document.getElementById("balanceSummary").innerHTML.length > 0',
      undefined, { timeout: 20_000 }
    );

    // جلستان: الأمس (تُستهلك أولاً بالـFIFO) ثم اليوم
    await addSession(page, descA, COST_A, ymdLocal(-1));
    await addSession(page, descB, COST_B, ymdLocal(0));

    // الدفعة 60,000
    console.log('E2E step: record payment');
    await page.locator('button:has-text("تسجيل دفعة")').first().click();
    await expect(page.locator('#payModal')).toBeVisible({ timeout: 10_000 });
    await page.locator('#payModal #payAmount').fill(String(PAY));
    await page.locator('#payModalSaveBtn').click();
    await expect(page.locator('#payModal')).toBeHidden({ timeout: 20_000 });

    // ⭐ حارس انحدار مباشر لإصلاح #318: قبله كان `savePayment` يوزّع بلا إعادة
    // رسم الجلسات فتبقى الشارات بايتة حتى إعادة تحميل. الآن نوكّد **حياً بلا
    // reload** — أي تراجع مستقبلي عن سطر الرندر يُسقط هذا الاختبار فوراً.
    console.log('E2E step: open sessions tab (no reload — live re-render)');
    await page.locator(`[onclick="switchTab('sessions',this)"]`).click();
    await expect(page.locator('#tab-sessions')).toHaveClass(/active/, { timeout: 10_000 });

    // ⭐ توكيد FIFO بالواجهة — بحلقة تقارب (#314): الرندر يلي realloc الشبكي،
    // والتوكيد إيجابي بلغة الكود (#315): سمات مشتقة لا نصوص معروضة.
    console.log('E2E step: assert FIFO badges in sessions tab');
    await expect(async () => {
      const rowA = page.locator(`[data-test="pp-session-row"]:has-text("${descA}")`);
      const rowB = page.locator(`[data-test="pp-session-row"]:has-text("${descB}")`);
      await expect(rowA).toBeVisible();
      await expect(rowB).toBeVisible();
      // تشخيص ذاتي (#313): «١ مقابل ٠» وحده لا يقول أي شارة ظهرت فعلاً —
      // نطبع نص الشارة الحية قبل التوكيد فيشرح أي فشل نفسه بسطر واحد.
      const badgeA = await rowA.locator('.cbadge[data-test^="pp-session-paid-"]').allInnerTexts();
      const badgeB = await rowB.locator('.cbadge[data-test^="pp-session-paid-"]').allInnerTexts();
      console.log(`E2E badges: A=${JSON.stringify(badgeA)} B=${JSON.stringify(badgeB)}`);
      // A الأقدم = مدفوعة بالكامل؛ B = جزئية (10k/30k)
      expect(await rowA.locator('[data-test="pp-session-paid-full"]').count(),
        'جلسة الأمس يجب أن تحمل شارة مدفوعة-بالكامل (FIFO الأقدم أولاً)').toBe(1);
      expect(await rowA.locator('[data-test="pp-session-paid-partial"]').count()).toBe(0);
      expect(await rowB.locator('[data-test="pp-session-paid-partial"]').count(),
        'جلسة اليوم يجب أن تحمل شارة جزئية').toBe(1);
      expect(await rowB.locator('[data-test="pp-session-paid-full"]').count()).toBe(0);
    }).toPass({ timeout: 20_000, intervals: [500, 1000, 2000] });

    // تبويب المدفوعات: صف الدفعة + بطاقات الرصيد تسكن `#tab-payments`
    console.log('E2E step: open payments tab + assert balance');
    await page.locator(`[onclick="switchTab('payments',this)"]`).click();
    await expect(page.locator('#tab-payments')).toHaveClass(/active/, { timeout: 10_000 });
    await expect(page.locator('[data-test="pp-payment-row"]')).toBeVisible({ timeout: 15_000 });
    await expect(async () => {
      // الرصيد: المنجز 80k · المدفوع 60k · على المريض 20k (تطبيع الأرقام)
      expect(digitsOf(await page.locator('[data-test="pp-bal-completed"]').innerText()))
        .toBe(COST_A + COST_B);
      expect(digitsOf(await page.locator('[data-test="pp-bal-paid"]').innerText()))
        .toBe(PAY);
      expect(digitsOf(await page.locator('[data-test="pp-bal-due"]').innerText()))
        .toBe(COST_A + COST_B - PAY);
    }).toPass({ timeout: 20_000, intervals: [500, 1000, 2000] });

    // ⭐ حقيقة الـDB (الحكم النهائي على FIFO — بجلسة المستأجر، قراءة فقط):
    // صفّان بالضبط، كلاهما earned، A=50k وB=10k، المجموع=PAY، صفر unearned.
    console.log('E2E step: assert payment_splits truth in DB');
    const sessions = await api.listByPatient('ledger_sessions', pid, 'id,description,cost,date');
    const sessA = sessions.find((s) => s.description === descA);
    const sessB = sessions.find((s) => s.description === descB);
    expect(sessA, 'جلسة A موجودة بالـDB').toBeTruthy();
    expect(sessB, 'جلسة B موجودة بالـDB').toBeTruthy();

    const splits = await api.listByPatient('payment_splits', pid, 'session_id,amount,is_unearned');
    expect(splits.length, 'عدد صفوف التوزيع').toBe(2);
    const unearned = splits.filter((s) => s.is_unearned === true);
    expect(unearned.length, 'صفر unearned — الدفعة أصغر من الإنتاج').toBe(0);
    const amtA = splits.filter((s) => s.session_id === sessA.id)
      .reduce((t, s) => t + (parseFloat(s.amount) || 0), 0);
    const amtB = splits.filter((s) => s.session_id === sessB.id)
      .reduce((t, s) => t + (parseFloat(s.amount) || 0), 0);
    expect(amtA, 'FIFO: الجلسة الأقدم تُستهلك كاملة').toBe(COST_A);
    expect(amtB, 'FIFO: المتبقي للجلسة الأحدث').toBe(PAY - COST_A);
    expect(amtA + amtB, 'حفظ القيمة: مجموع التوزيع = الدفعة').toBe(PAY);
    console.log(`E2E finance: FIFO verified — A=${amtA} B=${amtB} sum=${amtA + amtB}`);
  } finally {
    await api.sweep('after'); // يكنس المالية أولاً (FK) ثم المواعيد فالمرضى
  }
});
