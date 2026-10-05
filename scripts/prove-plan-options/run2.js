const X = require('./sc.js'), h = require('./h.js');
const T = X.T;
const rows = (b, n) => b.db.T.teeth_status.filter(r => String(r.tooth_num) === String(n)).map(r => r.surface + '=' + r.treatment_key + ':' + r.status + (r.unit_id ? '@' + r.unit_id : '')).sort().join(' ');
const ls = b => b.db.T.ledger_sessions.filter(r => r.status === 'planned').map(r => r.type + '#' + r.tooth_num + (r.plan_option ? '/' + r.plan_option : '')).sort().join(' | ');
const noOptBadges = b => [36, 43, 44, 45].every(n => { const t = X.tipOf(b, n); return !/خيار [أبج]/.test(t.facial + t.occ); });

(async () => {
  // ── A: adopt أ from the bar ──
  { const b = await X.buildFull(); b.dialogs.length = 0;
    await b.run('adoptPlanOption(1)');
    T('A: الاعتماد يسأل مرة واحدة فقط', b.dialogs.length === 1, 'dialogs=' + b.dialogs.length);
    T('A: تأكيد الاعتماد بنمط الخطر (يحذف بنوداً)', b.dialogs[0] && b.dialogs[0].danger === true, JSON.stringify(b.dialogs[0] && b.dialogs[0].danger));
    T('A: الباقي = بنود أ بلا وسم', ls(b) === ['تاج زركون#36', 'جسر (زركون)#43,44,45'].sort().join(' | '), ls(b));
    T('A: السن 36 = تاج زركون مخطّط فقط', rows(b, 36) === 'CROWN_FULL=czr:planned', rows(b, 36));
    T('A: 43/45 = جسر زركون مخطّط بالوحدة، و43 بلا تاج', rows(b, 43) === 'WHOLE=c_zr:planned@U1' && rows(b, 45) === 'WHOLE=c_zr:planned@U1', rows(b, 43) + ' || ' + rows(b, 45));
    T('A: 44 = القلع المنجز + وهمي زركون', rows(b, 44) === 'PONTIC=c_zr:planned@U1 WHOLE=extracted:completed', rows(b, 44));
    T('A: لا شارات خيار بعد الاعتماد', noOptBadges(b));
    X.invariants(b, 'A'); }

  // ── B: adopt ب ──
  { const b = await X.buildFull(); await b.run('adoptPlanOption(2)');
    T('B: الباقي = بنود ب', ls(b) === ['تاج خزف على معدن#36', 'جسر#43,44,45'].sort().join(' | '), ls(b));
    T('B: 36 = خزف مخطّط', rows(b, 36) === 'CROWN_FULL=crown:planned', rows(b, 36));
    T('B: الوحدة = جسر عادي', rows(b, 43) === 'WHOLE=bridge:planned@U1' && rows(b, 44) === 'PONTIC=bridge:planned@U1 WHOLE=extracted:completed', rows(b, 43) + ' || ' + rows(b, 44));
    X.invariants(b, 'B'); }

  // ── C: adopt ج from the bar ──
  { const b = await X.buildFull(); await b.run('adoptPlanOption(3)');
    T('C: الباقي = بنود ج', ls(b) === ['تاج زركون#43', 'زراعة#44', 'قلع#36'].sort().join(' | '), ls(b));
    T('C: 36 = قلع مخطّط فقط (التاجان حُذفا من المخطط)', rows(b, 36) === 'WHOLE=extracted:planned', rows(b, 36));
    T('C: 43 = تاج زركون مخطّط بلا جسر', rows(b, 43) === 'CROWN_FULL=czr:planned', rows(b, 43));
    T('C: 44 = زرعة مخطّطة', rows(b, 44) === 'WHOLE=implant:planned', rows(b, 44));
    T('C: 45 = سليم', rows(b, 45) === '', rows(b, 45));
    X.invariants(b, 'C'); }

  // ── D: complete the implant (ج) from the tooth modal ──
  { const b = await X.buildFull(); b.dialogs.length = 0;
    const imp = X.byType(b, 'زراعة', 44);
    await b.run(`completeSessionFromProfile('${imp.id}')`);
    T('D: تأكيد واحد جامع', b.dialogs.length === 1, 'dialogs=' + b.dialogs.length);
    T('D: التأكيد يحذف ⇒ نمط الخطر', b.dialogs[0] && b.dialogs[0].danger === true);
    T('D: الزرعة منجزة وبنود ج الأخرى مخطّطة بلا وسم', ls(b) === ['تاج زركون#43', 'قلع#36'].sort().join(' | ') && b.db.T.ledger_sessions.find(r => r.id === imp.id).status === 'completed', ls(b));
    T('D: 44 = زرعة منجزة على المخطط', rows(b, 44) === 'WHOLE=implant:completed', rows(b, 44));
    X.invariants(b, 'D'); }

  // ── E: complete the zirconia bridge (أ) ──
  { const b = await X.buildFull();
    const zb = X.byType(b, 'جسر (زركون)');
    await b.run(`completeSessionFromProfile('${zb.id}')`);
    T('E: الجسر الزركوني منجز', b.db.T.ledger_sessions.find(r => r.id === zb.id).status === 'completed');
    T('E: الباقي المخطّط = تاج زركون 36 فقط', ls(b) === 'تاج زركون#36', ls(b));
    T('E: صفوف الوحدة على المخطط صارت «منجز»', rows(b, 43) === 'WHOLE=c_zr:completed@U1' && rows(b, 44) === 'PONTIC=c_zr:completed@U1 WHOLE=extracted:completed', rows(b, 43) + ' || ' + rows(b, 44));
    X.invariants(b, 'E'); }

  // ── F: complete PFM 36 (ب) ──
  { const b = await X.buildFull();
    await b.run(`completeSessionFromProfile('pfm36')`);
    T('F: خزف 36 منجز على المخطط والجسر العادي باقٍ مخطّطاً', rows(b, 36) === 'CROWN_FULL=crown:completed' && rows(b, 43) === 'WHOLE=bridge:planned@U1', rows(b, 36) + ' || ' + rows(b, 43));
    T('F: الباقي = جسر ب', ls(b) === 'جسر#43,44,45', ls(b));
    X.invariants(b, 'F'); }

  // ── G: delete the drawn bridge session by hand (alternatives remain) ──
  { const b = await X.buildFull();
    await b.run(`delSession('br')`);
    T('G: المخطط يتبع الجسر الزركوني الباقي', rows(b, 43) === 'CROWN_FULL=czr:planned WHOLE=c_zr:planned@U1' && rows(b, 44) === 'PONTIC=c_zr:planned@U1 WHOLE=extracted:completed', rows(b, 43) + ' || ' + rows(b, 44));
    X.invariants(b, 'G'); }

  // ── H: delete the implant alternative ──
  { const b = await X.buildFull(); const imp = X.byType(b, 'زراعة', 44);
    await b.run(`delSession('${imp.id}')`);
    T('H: القلع والوهمي باقيان', rows(b, 44) === 'PONTIC=bridge:planned@U1 WHOLE=extracted:completed', rows(b, 44));
    X.invariants(b, 'H'); }

  // ── I: cancel at every confirmation ──
  { const b = await h.bootAsync({ confirm: false }); require('./s0.js').seed(b);
    b.ctx.sessions.forEach(s => { if (s.id === 'zr36') s.plan_option = 1; if (s.id === 'pfm36') s.plan_option = 2; });
    b.db.T.ledger_sessions.forEach(s => { if (s.id === 'zr36') s.plan_option = 1; if (s.id === 'pfm36') s.plan_option = 2; });
    const before = JSON.stringify(b.db.T);
    await b.run('adoptPlanOption(1)'); await b.run(`completeSessionFromProfile('zr36')`); await b.run(`delSession('br')`);
    T('I: الإلغاء بكل تأكيد ⇒ صفر تغيير بالقاعدة', JSON.stringify(b.db.T) === before); }

  // ── J: plan document with options (mixed currency) ──
  { const b = await X.buildFull(); const html = b.run('buildPlanHtml()').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    T('J: المستند: ثلاثة أقسام + مقارنة', /الخيار أ/.test(html) && /الخيار ب/.test(html) && /الخيار ج/.test(html) && /مقارنة الخيارات/.test(html));
    T('J: إجماليات صحيحة (أ 35,000 · ب 15,000 · ج 13,000 + 350$)', /إجمالي الخيار أ: 35,000 ل\.س/.test(html) && /إجمالي الخيار ب: 15,000 ل\.س/.test(html) && /إجمالي الخيار ج: 13,000 ل\.س · 350 \$/.test(html), (html.match(/إجمالي الخيار [أبج]: [^💰⚖]*/g) || []).join(' || ')); }

  console.log(`\n${X.OK} نجح · ${X.BAD} فشل`); if (X.BAD) console.log('FAILS:\n - ' + X.fails.join('\n - '));
})().catch(e => console.log('FATAL', e.stack));
