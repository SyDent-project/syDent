/* inv-consume.js — M169 (جولة المخزون، البند 1): مصدرٌ واحد لخصم المواد من الواجهة.
   الخصمُ نفسُه بالقاعدة (RPC inventory_consume): قفلُ الصنف + FEFO على الدفعات + حركةٌ لكل شريحة
   تحمل الجلسةَ والمريضَ والطبيبَ والدفعة — خطوةٌ واحدة، كلُّها أو لا شيء. هذا الملف يبني الحمولة
   ويقرأ النتيجة فقط، فالنافذتان (بطاقة المريض · المواعيد) وشاشةُ المخزون تمرّ من الطريق نفسه.
     • split(total, contribs): إجماليُّ صنفٍ (ربما عدّله الطبيب) يُوزَّع على جلساته بنسب مساهماتها
       الافتراضية — بالمئات (خطوةُ الحقل 0.01) وبطريقة أكبر الباقي ⇒ المجموعُ يطابق المُدخَل حرفياً.
     • buildLines(rows): صفوفُ النافذة ⇒ [{item_id, qty, session_id}] للقاعدة.
     • run(sb, lines, note) ⇒ {ok, lines} أو {ok:false, error}.
     • message(res, names): نصُّ التوست — والنقصُ يُعلَن باسم الصنف (#689).
     M173 (البند 5): رقمُ الدفعة — loadLots يجلب دفعاتِ الأصناف المرقّمة المفتوحة، وlotSelectHtml يعرض «الدفعة»
     بالنافذة (تلقائي = الأقرب انتهاءً)، والدفعةُ المختارة (LOT الزرعة الفعلي) تمرّ batch_id فتُؤخذ أولاً بالقاعدة. */
(function () {
  'use strict';

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function fmt(n) { return (Math.round(num(n) * 100) / 100).toLocaleString('en-US'); }

  function split(total, contribs) {
    var T = Math.round(num(total) * 100);
    if (!(T > 0)) return [];
    var cs = (contribs || []).filter(function (c) { return c && num(c.qty) > 0; });
    var sum = cs.reduce(function (a, c) { return a + num(c.qty); }, 0);
    if (!cs.length || !(sum > 0)) return [{ session_id: null, qty: T / 100 }];
    var parts = cs.map(function (c, i) {
      var exact = T * num(c.qty) / sum, fl = Math.floor(exact + 1e-9);
      return { i: i, sid: c.session_id || null, n: fl, frac: exact - fl };
    });
    var left = T - parts.reduce(function (a, p) { return a + p.n; }, 0);
    parts.slice().sort(function (a, b) { return (b.frac - a.frac) || (a.i - b.i); })
      .slice(0, Math.max(0, left)).forEach(function (p) { p.n++; });
    return parts.filter(function (p) { return p.n > 0; })
      .map(function (p) { return { session_id: p.sid, qty: p.n / 100 }; });
  }

  function buildLines(rows) {
    var out = [];
    (rows || []).forEach(function (r) {
      if (!r || !r.item_id) return;
      split(r.qty, r.contribs).forEach(function (s) {
        var ln = { item_id: r.item_id, qty: s.qty, session_id: s.session_id };
        if (r.batch_id) ln.batch_id = r.batch_id;
        out.push(ln);
      });
    });
    return out;
  }

  async function run(sb, lines, note) {
    if (!lines || !lines.length) return { ok: true, lines: [] };
    try {
      var r = await sb.rpc('inventory_consume', { p_lines: lines, p_note: note || null });
      if (r.error) return { ok: false, error: r.error };
      var got = (r.data && r.data.lines) || null;
      if (!Array.isArray(got)) return { ok: false, error: { message: 'empty_result' } };
      return { ok: true, lines: got };
    } catch (e) { return { ok: false, error: e }; }
  }

  /* نتيجةُ القاعدة لكل صنف (الصنفُ قد يتوزّع على عدّة جلسات ⇒ يُجمَع) */
  function byItem(lines) {
    var m = {}, order = [];
    (lines || []).forEach(function (l) {
      var k = l.item_id;
      if (!m[k]) { m[k] = { item_id: k, requested: 0, deducted: 0, skipped: null }; order.push(k); }
      m[k].requested += num(l.requested);
      m[k].deducted += num(l.deducted);
      if (l.skipped) m[k].skipped = l.skipped;
    });
    return order.map(function (k) { return m[k]; });
  }

  function errText(err) {
    var msg = String((err && (err.message || err.code)) || '');
    if (/read_only/.test(msg)) return '⚠️ الحساب بوضع القراءة فقط — ما انخصم شي من المخزون';
    if (/Failed to fetch|NetworkError|network|offline/i.test(msg)) return '⚠️ ما في اتصال — ما انخصم شي من المخزون، جرّب لما يرجع النت';
    return '⚠️ تعذّر خصم المواد — ما انخصم شي من المخزون';
  }

  function message(res, names) {
    if (!res || !res.ok) return errText(res && res.error);
    var items = byItem(res.lines);
    var full = 0, notes = [];
    items.forEach(function (it) {
      var nm = (names && names[it.item_id]) || 'صنف';
      if (it.skipped === 'inactive') { notes.push('«' + nm + '» محذوف من المخزون'); return; }
      if (it.deducted + 1e-9 < it.requested) {
        notes.push('«' + nm + '»: انخصم ' + fmt(it.deducted) + ' من ' + fmt(it.requested) + ' (ما في أكتر بالمخزون)');
      } else { full++; }
    });
    if (!notes.length) return 'تم خصم ' + full + ' مادة من المخزون ✓';
    return '⚠️ ' + (full ? 'تم خصم ' + full + ' مادة · ' : '') + notes.join(' · ');
  }

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function dmy(d) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || '')); return m ? (m[3] + '/' + m[2] + '/' + m[1]) : ''; }
  /* «LOT 123 · صلاحية 27/10/2026 · متبقٍّ 4» — نصٌّ خام (المستدعي يهرّبه) */
  function lotLabel(b) {
    var p = [];
    if (b && b.lot_no) p.push('LOT ' + b.lot_no);
    if (b && b.expiry_date) p.push('صلاحية ' + dmy(b.expiry_date));
    if (b && b.quantity != null) p.push('متبقٍّ ' + fmt(b.quantity));
    return p.join(' · ') || 'دفعة';
  }
  /* الدفعاتُ المرقّمة المفتوحة لأصنافٍ ⇒ { item_id: [batch…] } بترتيب FEFO — فشلُها لا يكسر النافذة (تلقائي) */
  async function loadLots(sb, ownerId, itemIds) {
    var out = {};
    var ids = (itemIds || []).filter(Boolean);
    if (!ids.length) return out;
    try {
      for (var i = 0; i < ids.length; i += 150) {
        var r = await sb.from('inventory_batches').select('id, item_id, lot_no, expiry_date, quantity')
          .eq('owner_id', ownerId).eq('is_finished', false).not('lot_no', 'is', null)
          .in('item_id', ids.slice(i, i + 150)).order('expiry_date', { ascending: true, nullsFirst: false }).limit(1000);
        if (r.error) return {};
        (r.data || []).forEach(function (b) { if (num(b.quantity) > 0) (out[b.item_id] = out[b.item_id] || []).push(b); });
      }
    } catch (e) { return {}; }
    return out;
  }
  function lotSelectHtml(cls, idx, lots) {
    if (!lots || !lots.length) return '';
    return '<label style="display:block;margin-top:6px;font-size:11px;color:var(--text2);">الدفعة (LOT)'
      + '<select class="' + esc(cls) + '" data-idx="' + esc(idx) + '" style="display:block;width:100%;margin-top:3px;padding:7px;border:1px solid var(--border);border-radius:8px;background:var(--bg3);color:var(--text);font-family:Cairo,sans-serif;font-size:12px;">'
      + '<option value="">تلقائي — الأقرب انتهاءً</option>'
      + lots.map(function (b) { return '<option value="' + esc(b.id) + '">' + esc(lotLabel(b)) + '</option>'; }).join('')
      + '</select></label>';
  }

  window.SyDentInvConsume = { split: split, buildLines: buildLines, run: run, byItem: byItem, message: message,
    lotLabel: lotLabel, loadLots: loadLots, lotSelectHtml: lotSelectHtml };
})();
