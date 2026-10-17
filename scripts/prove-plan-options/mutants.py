# v600: طفراتُ مثبت run6 (قاعدة #637) — كلُّ طفرةٍ يجب أن تُسقط المثبت ثم يُستعاد الملفُّ حرفياً
import subprocess,sys
import os
R=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..'))+'/'
M=[('pp-dental.js',"var isAlreadyExtracted = _ext && !_extPlanned;","var isAlreadyExtracted = _ext;"),
 ('pp-dental.js',"window.__examMode !== true && isExtractionPlanned(currentTooth)","window.__examMode !== true && false && isExtractionPlanned(currentTooth)"),
 ('pp-dental.js',"if (x.status !== 'completed' && isExtractionPlanned(tn)) continue;",""),
 ('patient-profile.html',"try { await drawPendingImplantAfterExtraction(tn); }","try { }"),
 ('pp-dental.js',"      await _implantAltRestore(_ia.tooth, _iaBefore);\n      renderTeeth();",""),
 ('pp-dental.js',"_sp.overImplantOpt = await tagBridgeOverPendingImplants(newSess, bridgeUnitForLedger);",""),
 ('pp-dental.js',"if (_rxSt === 'planned') _rxRow.status = 'planned';",""),
 ('pp-modules.js',"var _xPl = (typeof isExtractionPlanned === 'function') && isExtractionPlanned(n);","var _xPl = false;"),
 ('patient-profile.html',"if (_orph.length && await SyDialog.confirm({","if (false && await SyDialog.confirm({"),
 ('pp-dental.js',"if (tpS === 'implant' || tpS === 'bridge') return !isPrimaryTooth(n);",""),
]
bad=0
for i,(f,a,b) in enumerate(M,1):
  p=R+f; o=open(p,encoding='utf-8').read(); assert o.count(a)==1,(i,a)
  open(p,'w',encoding='utf-8').write(o.replace(a,b))
  r=subprocess.run(['node',R+'scripts/prove-plan-options/run6.js'],capture_output=True,text=True,timeout=300)
  open(p,'w',encoding='utf-8').write(o)
  fails=[l for l in r.stdout.splitlines() if l.startswith('✗') or l.startswith('FATAL')]
  if not any(l.startswith('✓') for l in r.stdout.splitlines()):
    print('⛔ طفراتُ run6: العُدّة لم تُقلع (M%d) — %s' % (i, (r.stderr or r.stdout).strip().splitlines()[-1:] )); sys.exit(1)
  bad += 0 if fails else 1
  if '-v' in sys.argv or not fails: print(('🦷 عضّت' if fails else '⛔ لم تعضّ'),'M%d'%i, (fails[0][:90] if fails else ''))
print(('✅' if not bad else '⛔'), 'طفراتُ run6: %d/%d تعضّ' % (len(M)-bad, len(M)))
sys.exit(1 if bad else 0)
