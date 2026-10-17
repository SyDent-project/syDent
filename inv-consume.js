/* inv-consume.js — M169 (جولة المخزون، البند 1): مصدرٌ واحد لخصم المواد من الواجهة.
   الخصمُ نفسُه بالقاعدة (RPC inventory_consume): قفلُ الصنف + FEFO على الدفعات + حركةٌ لكل شريحة
   تحمل الجلسةَ والمريضَ والطبيبَ والدفعة — خطوةٌ واحدة، كلُّها أو لا شيء. هذا الملف يبني الحمولة
   ويقرأ النتيجة فقط، فالنافذتان (بطاقة المريض · المواعيد) وشاشةُ المخزون تمرّ من الطريق نفسه.
     • split(total, contribs): إجماليُّ صنفٍ (ربما عدّله الطبيب) يُوزَّع على جلساته بنسب مساهماتها
       الافتراضية — بالمئات (خطوةُ الحقل 0.01) وبطريقة أكبر الباقي ⇒ المجموعُ يطابق المُدخَل حرفياً.
     • buildLines(rows): صفوفُ النافذة ⇒ [{item_id, qty, session_id}] للقاعدة.
     • run(sb, lines, note) ⇒ {ok, lines} أو {ok:false, error}.
     • message(res, names): نصُّ التوست — والنقصُ يُعلَن باسم الصنف (#689).
     • M173: loadLots(sb, ownerId, itemIds) الدفعاتُ المفتوحة ذاتُ الرقم (LOT) لكل صنف، الأقربُ انتهاءً أولاً ·
       lotPicker(cls, idx, list) منتقي «الدفعة (LOT)» للنافذتين — الفارغُ «تلقائي» (FEFO كما كان)،
       والمختارةُ تُخصم أولاً بالقاعدة (batch_id بالسطر). */
(function () {
  'use strict';

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function fmt(n) { return (Math.round(num(n) * 100) / 100).toLocaleString('en-US'); }
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function dmy(v) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || '')); return m ? (m[3] + '/' + m[2] + '/' + m[1]) : ''; }

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
        var l = { item_id: r.item_id, qty: s.qty, session_id: s.session_id };
        if (r.batch_id) l.batch_id = r.batch_id;   // M173: الدفعةُ المختارة أولاً
        out.push(l);
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
    if (/read_only/.test(msg)) return '⚠️ الحساب بوضع القراءة فقط — لم يُخصم شيء من المخزون';
    if (/Failed to fetch|NetworkError|network|offline/i.test(msg)) return '⚠️ لا يوجد اتصال — لم يُخصم شيء من المخزون، أعد المحاولة عند عودة الاتصال';
    return '⚠️ تعذّر خصم المواد — لم يُخصم شيء من المخزون';
  }

  function message(res, names) {
    if (!res || !res.ok) return errText(res && res.error);
    var items = byItem(res.lines);
    var full = 0, notes = [];
    items.forEach(function (it) {
      var nm = (names && names[it.item_id]) || 'صنف';
      if (it.skipped === 'inactive') { notes.push('«' + nm + '» محذوف من المخزون'); return; }
      if (it.deducted + 1e-9 < it.requested) {
        notes.push('«' + nm + '»: انخصم ' + fmt(it.deducted) + ' من ' + fmt(it.requested) + ' (لا يوجد أكثر في المخزون)');
      } else { full++; }
    });
    if (!notes.length) return 'تم خصم ' + full + ' مادة من المخزون ✓';
    return '⚠️ ' + (full ? 'تم خصم ' + full + ' مادة · ' : '') + notes.join(' · ');
  }

  async function loadLots(sb, ownerId, itemIds) {
    var out = {};
    if (!sb || !ownerId || !itemIds || !itemIds.length) return out;
    try {
      var r = await sb.from('inventory_batches').select('id, item_id, lot, quantity, expiry_date')
        .eq('owner_id', ownerId).eq('is_finished', false).not('lot', 'is', null).in('item_id', itemIds);
      if (r.error || !r.data) return out;
      r.data.filter(function (b) { return b.lot && num(b.quantity) > 0; })
        .sort(function (a, b) {
          var ea = a.expiry_date || '9999-12-31', eb = b.expiry_date || '9999-12-31';
          return ea < eb ? -1 : ea > eb ? 1 : String(a.lot).localeCompare(String(b.lot));
        })
        .forEach(function (b) { (out[b.item_id] = out[b.item_id] || []).push(b); });
    } catch (e) { /* المنتقي اختياري — بلا دفعات يبقى الخصمُ FEFO */ }
    return out;
  }

  function lotPicker(cls, idx, list) {
    if (!list || !list.length) return '';
    var h = '<label class="sd-lot"><span>الدفعة (LOT)</span><select class="' + esc(cls) + '" data-idx="' + esc(idx) + '">'
      + '<option value="">تلقائياً — الأقرب انتهاءً</option>';
    list.forEach(function (b) {
      h += '<option value="' + esc(b.id) + '">' + esc(b.lot) + ' · المتبقّي ' + esc(fmt(b.quantity))
        + (b.expiry_date ? ' · ' + esc(dmy(b.expiry_date)) : '') + '</option>';
    });
    return h + '</select></label>';
  }

  /* النافذتان: صفُّ كل مادة بترتيب list ⇒ المنتقي بعده مباشرة (بعد الفتح — لا يؤخّر النافذة) */
  async function attachLots(sb, ownerId, host, list, cls) {
    if (!host || !list || !list.length) return;
    var rows = host.children ? Array.prototype.slice.call(host.children) : [];
    var lots = await loadLots(sb, ownerId, list.map(function (m) { return m.item_id; }));
    list.forEach(function (m, i) {
      var pk = lotPicker(cls, i, lots[m.item_id]);
      if (pk && rows[i] && rows[i].isConnected) rows[i].insertAdjacentHTML('afterend', pk);
    });
  }
  function pickedLot(host, cls, idx) {
    var el = (host && typeof host.querySelector === 'function') ? host.querySelector('select.' + cls + '[data-idx="' + idx + '"]') : null;
    return (el && el.value) || null;
  }

  window.SyDentInvConsume = { split: split, buildLines: buildLines, run: run, byItem: byItem, message: message,
    loadLots: loadLots, lotPicker: lotPicker, attachLots: attachLots, pickedLot: pickedLot };
})();
