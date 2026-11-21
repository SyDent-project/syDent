# -*- coding: utf-8 -*-
"""مثبتُ المسارات على الصفحات الحقيقية (طلب المالك 21/11/2026 بعد أول تجربة حيّة: «راجع كل خطوة»).
الصفحاتُ تُخدَّم كما هي من المستودع ولا يُحقن فيها شيء؛ نداءاتُ Supabase (auth · REST · RPC) يجيب عنها خادمٌ بالذاكرة
يفهم مرشّحات PostgREST الشائعة (eq · neq · in · is · gte/lte · not.*) والكتابات (POST بـon_conflict · PATCH · DELETE).
لماذا: مثبتاتُ vm والشواهدُ المقتطعة أثبتت كلَّ وحدةٍ بمفردها، ولم ترَ أنّ صفَّ الموافقات يقع خارج الشاشة حين يعمل
الطبيب على المخطط — فبدا للمالك أنّ الموافقة «ما طلعت». هذا يشغّل المسار كما يشغّله المستخدم."""
import os, json, time, base64, threading, http.server, socketserver, uuid, re
from urllib.parse import urlparse, parse_qsl, unquote
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
UID = '11111111-1111-1111-1111-111111111111'
def b64(o): return base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip('=')
EXP = int(time.time()) + 86400 * 30
USER = {'id': UID, 'aud': 'authenticated', 'role': 'authenticated', 'email': 't@t.t', 'app_metadata': {}, 'user_metadata': {}, 'created_at': '2026-01-01T00:00:00Z'}
SESSION = {'access_token': b64({'alg': 'HS256', 'typ': 'JWT'}) + '.' + b64({'sub': UID, 'role': 'authenticated', 'exp': EXP, 'aud': 'authenticated'}) + '.sig',
           'refresh_token': 'r', 'token_type': 'bearer', 'expires_in': 86400 * 30, 'expires_at': EXP, 'user': USER}

def catalog():
    import subprocess
    s = open(os.path.join(ROOT, 'treatments.html'), encoding='utf-8').read()
    i = s.index('const CLINIC_CATALOG = ['); j = s.index('];', i) + 2
    js = s[i:j].replace('const CLINIC_CATALOG', 'const C') + ';process.stdout.write(JSON.stringify(C))'
    rows = json.loads(subprocess.check_output(['node', '-e', js]).decode())
    for k, r in enumerate(rows):
        r.setdefault('id', 't%d' % k); r['doctor_id'] = UID
    return rows

class DB:
    def __init__(self):
        self.t = {}; self.writes = []; self.reads = []; self.rpc = {}; self.rpc_calls = []
        self.defaults = {'patient_portals': lambda r: r.setdefault('token', uuid.uuid4().hex + uuid.uuid4().hex)}   # أعمدةٌ تملؤها القاعدة
    def rows(self, name): return self.t.setdefault(name, [])
    @staticmethod
    def _val(v):
        if v == 'null': return None
        if v == 'true': return True
        if v == 'false': return False
        return v
    def _match(self, row, filters):
        for k, v in filters:
            neg = False
            if v.startswith('not.'): neg = True; v = v[4:]
            op, _, arg = v.partition('.')
            cur = row.get(k)
            if op == 'eq': r = (str(cur) == arg) if not isinstance(cur, bool) and cur is not None else (cur == self._val(arg))
            elif op == 'neq': r = str(cur) != arg
            elif op == 'is': r = (cur is None) if arg == 'null' else (cur is True if arg == 'true' else cur is False)
            elif op == 'in': r = str(cur) in [x.strip('"') for x in arg.strip('()').split(',')] if cur is not None else False
            elif op in ('gte', 'lte', 'gt', 'lt'):
                if cur is None: r = False
                else:
                    a, b = str(cur), arg
                    r = {'gte': a >= b, 'lte': a <= b, 'gt': a > b, 'lt': a < b}[op]
            else: r = True   # like / ilike / cs … : not narrowed
            if neg: r = not r
            if not r: return False
        return True
    def handle(self, rt):
        req = rt.request; u = urlparse(req.url); path = u.path
        q = parse_qsl(u.query, keep_blank_values=True)
        if '/auth/v1/user' in path: return rt.fulfill(status=200, content_type='application/json', body=json.dumps(USER))
        if '/auth/v1/' in path: return rt.fulfill(status=200, content_type='application/json', body=json.dumps(SESSION))
        if '/rest/v1/rpc/' in path:
            n = path.split('/rest/v1/rpc/')[1]
            try: args = json.loads(req.post_data or '{}')
            except Exception: args = {}
            self.rpc_calls.append((n, args))
            h = self.rpc.get(n)
            out = h(args) if callable(h) else h
            return rt.fulfill(status=200, content_type='application/json', body=json.dumps(out))
        if '/rest/v1/' in path:
            tbl = path.split('/rest/v1/')[1]; acc = req.headers.get('accept', ''); pref = req.headers.get('prefer', '')
            filters = [(k, v) for k, v in q if k not in ('select', 'order', 'limit', 'offset', 'or', 'and', 'on_conflict', 'columns')]
            rows = self.rows(tbl)
            if req.method == 'GET' or req.method == 'HEAD':
                self.reads.append((tbl, dict(q)))
                m = [r for r in rows if self._match(r, filters)]
                order = dict(q).get('order')
                if order:
                    for part in reversed(order.split(',')):
                        col, _, d = part.partition('.')
                        m.sort(key=lambda r: (r.get(col) is None, str(r.get(col) or '')), reverse=d.startswith('desc'))
                lim = dict(q).get('limit')
                if lim: m = m[:int(lim)]
                hdr = {'content-range': '0-%d/%d' % (max(len(m) - 1, 0), len(m)), 'access-control-expose-headers': 'content-range', 'access-control-allow-origin': '*'}
                if req.method == 'HEAD': return rt.fulfill(status=200, headers=hdr, body='')
                if 'vnd.pgrst.object' in acc:
                    if m: return rt.fulfill(status=200, content_type='application/json', body=json.dumps(m[0]))
                    return rt.fulfill(status=406, content_type='application/json', body='{"code":"PGRST116","message":"0 rows"}')
                return rt.fulfill(status=200, content_type='application/json', headers=hdr, body=json.dumps(m))
            body = None
            try: body = json.loads(req.post_data) if req.post_data else None
            except Exception: body = None
            self.writes.append((tbl, req.method, body, dict(q)))
            out = []
            if req.method == 'POST':
                items = body if isinstance(body, list) else [body or {}]
                conflict = dict(q).get('on_conflict')
                for it in items:
                    row = None
                    if conflict:
                        keys = conflict.split(',')
                        row = next((r for r in rows if all(r.get(k) == it.get(k) for k in keys)), None)
                    if row is not None: row.update(it)
                    else:
                        row = dict(it); row.setdefault('id', str(uuid.uuid4())); row.setdefault('created_at', time.strftime('%Y-%m-%dT%H:%M:%S+00:00', time.gmtime()))
                        if tbl in self.defaults: self.defaults[tbl](row)
                        rows.append(row)
                    out.append(row)
            elif req.method == 'PATCH':
                for r in rows:
                    if self._match(r, filters): r.update(body or {}); out.append(r)
            elif req.method == 'DELETE':
                keep = []
                for r in rows:
                    (out if self._match(r, filters) else keep).append(r)
                self.t[tbl] = keep
            if 'return=representation' in pref:
                if 'vnd.pgrst.object' in acc:
                    if out: return rt.fulfill(status=200 if req.method != 'POST' else 201, content_type='application/json', body=json.dumps(out[0]))
                    return rt.fulfill(status=406, content_type='application/json', body='{"code":"PGRST116","message":"0 rows"}')
                return rt.fulfill(status=200 if req.method != 'POST' else 201, content_type='application/json', body=json.dumps(out))
            return rt.fulfill(status=204, body='')
        if '/functions/v1/' in path or '/storage/v1/' in path or '/realtime/' in path: return rt.fulfill(status=200, content_type='application/json', body='[]')
        if req.url.startswith('http://127.0.0.1:'): return rt.continue_()
        return rt.abort()

_servers = {}
def serve(port):
    if port in _servers: return
    class Q(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
        def log_message(self, *a): pass
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.ThreadingTCPServer(('127.0.0.1', port), Q)
    threading.Thread(target=httpd.serve_forever, daemon=True).start(); _servers[port] = httpd

def context(browser, db, w=1366, h=768, theme='light', lang='ar', extra_ls=None):
    ctx = browser.new_context(viewport={'width': w, 'height': h}, service_workers='block', has_touch=(w < 800))
    ctx.route('**/*', db.handle)
    L = {'sydent.auth': json.dumps(SESSION), 'sydent.lang': lang, 'sydent_theme': theme}; L.update(extra_ls or {})
    ctx.add_init_script('(()=>{const L=%s;for(const k in L){try{if(localStorage.getItem(k)===null)localStorage.setItem(k,L[k])}catch(e){}}})()' % json.dumps(L))
    return ctx

def base_db():
    db = DB()
    db.t['trial_requests'] = [{'status': 'accepted', 'plan': 'pro', 'user_id': UID}]
    db.t['treatments'] = catalog()
    db.t['patients'] = [{'id': 'P1', 'doctor_id': UID, 'name': 'سامر خليل', 'phone': '0933000001', 'gender': 'ذكر', 'created_at': '2026-11-01T10:00:00Z'}]
    db.t['clinic_settings'] = [{'owner_id': UID, 'clinic_name': 'عيادة النور', 'booking_work_days': '0,1,2,3,4,6', 'booking_work_start': '09:00', 'booking_work_end': '17:00', 'booking_slot_minutes': 30}]
    db.t['clinic_doctors'] = [{'id': 'D0', 'owner_id': UID, 'name': 'د. أيهم', 'is_owner': True, 'is_active': True, 'provider_type': 'doctor', 'share_percent': 100, 'color': '#0ea5a4'}]
    db.rpc['my_subscription_state'] = {'level': 'full', 'plan': 'pro', 'status': 'active'}
    return db


# ── قاعدةُ _consent_sync (M225) مُعادةً على جداول الذاكرة: المخطّطُ المعتمد وحده يولّد موافقة، والملغاةُ تغطّي جلساتِها ──
def today(): return time.strftime('%Y-%m-%d')
def make_consent_sync(db, uid):
    def sync(args):
        pid = args.get('p_patient'); S = db.rows('ledger_sessions'); C = db.rows('patient_consents'); T = db.rows('consent_templates')
        n = 0
        mine = [s for s in S if s.get('doctor_id') == uid and s.get('patient_id') == pid]
        opts = set(s.get('plan_option') for s in mine if (s.get('status') or 'completed') == 'planned' and s.get('plan_option') in (1, 2, 3))
        adopted = lambda s: len(opts) <= 1 or s.get('plan_option') not in (1, 2, 3)
        tkeys = set(t['treatment_key'] for t in T if t.get('owner_id') == uid)
        for c in [c for c in C if c.get('owner_id') == uid and c.get('patient_id') == pid and c.get('status') == 'pending' and c.get('auto')]:
            keep = [s['id'] for s in mine if s['id'] in c['session_ids'] and not s.get('parent_id') and s.get('treatment_key') == c['treatment_key'] and s.get('treatment_key') in tkeys
                    and ((s.get('status') or 'completed') == 'completed' or ((s.get('status') or 'completed') == 'planned' and adopted(s)))]
            if not keep: C.remove(c); n += 1
            elif len(keep) != len(c['session_ids']): c['session_ids'] = keep; n += 1
        for t in [t for t in T if t.get('owner_id') == uid]:
            ids = [s['id'] for s in mine if not s.get('parent_id') and s.get('treatment_key') == t['treatment_key']
                   and (s.get('status') or 'completed') == 'planned' and adopted(s)]
            covered = set(x for c in C if c.get('owner_id') == uid and c.get('patient_id') == pid and c.get('status') in ('pending', 'signed', 'void') for x in c['session_ids'])
            new = [x for x in ids if x not in covered]
            if not new: continue
            cur = next((c for c in C if c.get('owner_id') == uid and c.get('patient_id') == pid and c.get('treatment_key') == t['treatment_key'] and c.get('status') == 'pending' and c.get('auto')), None)
            teeth = lambda ids_: '، '.join(sorted(set(str(s.get('tooth_num')) for s in mine if s['id'] in ids_ and s.get('tooth_num'))))
            if cur: cur['session_ids'] = cur['session_ids'] + new; cur['teeth'] = teeth(cur['session_ids'])
            else:
                name = next((x.get('name') for x in db.rows('treatments') if x.get('treatment_key') == t['treatment_key']), None)
                C.append({'id': str(uuid.uuid4()), 'owner_id': uid, 'patient_id': pid, 'treatment_key': t['treatment_key'], 'treatment_name': name, 'title': t['title'], 'body': t['body'], 'teeth': teeth(new),
                          'session_ids': new, 'auto': True, 'status': 'pending', 'created_at': time.strftime('%Y-%m-%dT%H:%M:%S+00:00', time.gmtime()), 'signed_at': None, 'signer_name': None, 'signer_relation': None, 'voided_at': None})
            n += 1
        return n
    return sync


def portal_rpcs(db, uid):
    """أبوابُ البوابة الثلاثة التي تحتاجها صفحةُ portal.html لمسار التوقيع — التوكنُ يُحلّ من patient_portals كما بالقاعدة."""
    def who(a):
        r = next((x for x in db.rows('patient_portals') if x.get('token') == a.get('p_token') and not x.get('revoked_at') and x.get('owner_id') == uid), None)
        return r['patient_id'] if r else None
    def info(a):
        patient_id = who(a)
        if not patient_id: return None
        p = next(x for x in db.rows('patients') if x['id'] == patient_id)
        return {'status': 'ok', 'clinic_name': 'عيادة النور', 'clinic_phone': '0999999999', 'patient_name': p['name'], 'expires_at': '2099-01-01T10:00:00Z', 'show': {}}
    def consents(a):
        patient_id = who(a)
        if not patient_id: return {'ok': False}
        db.rpc['consent_sync']({'p_patient': patient_id})
        return {'ok': True, 'items': [{'id': c['id'], 'title': c['title'], 'body': c['body'], 'treatment': c.get('treatment_name'), 'teeth': c.get('teeth'), 'status': c['status'],
                 'signed_at': c.get('signed_at'), 'signer': c.get('signer_name')} for c in db.rows('patient_consents') if c['patient_id'] == patient_id and c['status'] in ('pending', 'signed')]}
    def sign(a):
        patient_id = who(a)
        if not patient_id: return {'ok': False, 'reason': 'unavailable'}
        c = next((x for x in db.rows('patient_consents') if x['id'] == a.get('p_consent') and x['patient_id'] == patient_id), None)
        if not c or c['status'] != 'pending': return {'ok': False, 'reason': 'unavailable'}
        if not re.match(r'^data:image/png;base64,[A-Za-z0-9+/]+=*$', a.get('p_signature') or '') or len((a.get('p_name') or '').strip()) < 2: return {'ok': False, 'reason': 'bad_input'}
        c.update({'status': 'signed', 'signed_at': time.strftime('%Y-%m-%dT%H:%M:%S+00:00', time.gmtime()), 'signer_name': a['p_name'].strip(), 'signer_relation': a.get('p_relation'), 'signature': a['p_signature']})
        return {'ok': True, 'signed_at': c['signed_at']}
    db.rpc['portal_info'] = info; db.rpc['portal_consents'] = consents; db.rpc['portal_consent_sign'] = sign
