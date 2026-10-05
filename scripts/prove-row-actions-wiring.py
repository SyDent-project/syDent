#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# v474 — مثبتُ «التوصيل لم يتغيّر» لجولة أزرار الصفوف: لكل زرٍّ بمعالج (onclick أو data-appt-act) بالملفات المُرحَّلة،
# يقارن بين نسخةٍ أساس (قبل الجولة) والشجرة الحالية: الدوالُّ المُستدعاة · الفعلُ المفوَّض · data-test · وسومُ الصلاحيات
# (data-sub-write · data-role-block · data-doctor-inactive-block · disabled · data-id · href). أيُّ فقدٍ أو إضافة ⇒ فشل.
# الاستعمال: python3 scripts/prove-row-actions-wiring.py [BASE]   (الافتراضي 809e9573 = آخر كومِت قبل الجولة؛ يحتاج تاريخ git كاملاً)
import subprocess, re, collections, sys
BASE=sys.argv[1] if len(sys.argv) > 1 else '809e9573'
FILES=['appointments.html','appt-booking.js','appt-views.js','patients.html','patient-profile.html','pp-clinical.js','pp-plan.js','pp-modules.js','pp-appt.js','pp-extras.js','treatments.html','doctors.html','employees.html','payouts.html','expenses.html','inventory.html','labs.html','provider-reports.html','audit-log.html','admin-render.js','admin.html','settings.html','appt-wa.js','pp-dental.js']
def src(rev,f):
    return subprocess.run(['git','show',f'{rev}:{f}'],capture_output=True,text=True).stdout if rev else open(f,encoding='utf-8').read()
def buttons(s):
    out=[]
    for m in re.finditer(r'<(button|a)\b',s):
        i=m.start(); q=False; j=i
        while j<len(s):
            c=s[j]
            if c=='"': q=not q
            elif c=='>' and not q: break
            j+=1
        out.append(s[i:j+1])
    return out
def sig(tag):
    oc=re.search(r'onclick=\\?"((?:\\\'|[^"\\])*)',tag); oc=oc.group(1) if oc else ''
    calls=tuple(sorted(set(re.findall(r'([A-Za-z_$][\w$]*)\(',oc))-{'function'}))
    act=re.search(r'data-appt-act=\\?"([a-z]+)',tag); act=act.group(1) if act else ''
    attrs=tuple(sorted(a for a in re.findall(r'\b(data-test|data-sub-write|data-role-block|data-doctor-inactive-block|disabled|data-id|href)\b',tag)))
    dt=re.search(r'data-test=\\?"([^"\\]+)',tag); dt=dt.group(1) if dt else ''
    return (calls,act,dt,attrs)
bad=0
for f in FILES:
    a=collections.Counter(sig(t) for t in buttons(src(BASE,f)) if re.search(r'onclick=|data-appt-act=',t))
    b=collections.Counter(sig(t) for t in buttons(src(None,f)) if re.search(r'onclick=|data-appt-act=',t))
    lost=a-b; gained=b-a
    status='✅' if not lost and not gained else '⚠️'
    if lost or gained: bad+=1
    print(f'{status} {f}: {sum(a.values())} → {sum(b.values())} أزرار بمعالج')
    for k,v in lost.items(): print('    − فُقد:',k,v)
    for k,v in gained.items(): print('    + جديد:',k,v)
print(('✅' if not bad else '⛔') + ' التوصيل: ' + str(len(FILES)) + ' ملفات · ' + ('لا فقدَ ولا إضافة' if not bad else str(bad) + ' ملف تغيّر توصيله')); sys.exit(1 if bad else 0)
