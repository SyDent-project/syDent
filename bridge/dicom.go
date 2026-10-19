package main

// مستقبِلُ DICOM (Storage SCP) — ربط الأجهزة ٥ (v1.1.0)
//
// أجهزةُ البانوراما والسيفالومترية وCBCT ترسل صورَها بالشبكة إلى «جهاز أرشفة» ببروتوكول DICOM (الطبقةُ العليا
// A-ASSOCIATE / P-DATA / A-RELEASE + خدمةُ C-STORE وC-ECHO). هذا الملفُّ يجعل SyDent Bridge ذلك الجهاز:
//   • يقبل الاقترانَ (association) لأي AE بعنواننا (ae_title) وأي صنفِ تخزينٍ من قائمة الأصناف الصورية + Verification.
//   • الترميزاتُ المقبولة: ضمني/صريح LE (نفضّل الصريح) والمضغوطةُ الشائعة (JPEG Baseline · Lossless · JPEG 2000 · RLE)
//     — نخزّن البايتاتِ كما وصلت ونكتب ترميزَها بالترويسة (العارضُ يعرض غيرَ المضغوط وJPEG Baseline ويعلن الباقي).
//   • كلُّ C-STORE ناجح يُكتب ملفَّ Part 10 (تمهيد 128 + DICM + مجموعة 0002) في <configDir>/dicom-in/ — وهذا المجلدُ
//     مراقَبٌ تلقائياً، فيسلك الملفُّ مسارَ الرفع نفسَه (طلبٌ مفتوح ⇒ المريض، وإلا الوارد).
//   • لا نفسّر مجموعةَ البيانات نفسَها (الحجمُ قد يبلغ ميغابايتات) — نقرأ فقط مجموعةَ الأوامر (0000) بترميزٍ ضمني LE.
// المكتبةُ القياسية وحدها. الاختبارُ: dcmtk (echoscu · storescu) على لينكس — راجع README.

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	dcmDefaultPort  = 4242
	dcmDefaultAE    = "SYDENT"
	dcmMaxPDU       = 1 << 20 // ما نعلنه للطرف الآخر
	dcmMaxDataset   = 300 << 20
	dcmIdle         = 90 * time.Second
	uidVerification = "1.2.840.10008.1.1"
	uidImplicitLE   = "1.2.840.10008.1.2"
	uidExplicitLE   = "1.2.840.10008.1.2.1"
	// UIDُ تنفيذنا تحت قوس 2.25 (UUID-derived) — لا يحتاج تسجيلاً
	uidImplementation = "2.25.112233445566778899001122334455667788"
	implVersionName   = "SYDENT_BRIDGE"
)

var dcmStorageClasses = map[string]string{
	"1.2.840.10008.5.1.4.1.1.1":        "CR",
	"1.2.840.10008.5.1.4.1.1.1.1":      "DX (presentation)",
	"1.2.840.10008.5.1.4.1.1.1.1.1":    "DX (processing)",
	"1.2.840.10008.5.1.4.1.1.1.3":      "Intra-oral (presentation)",
	"1.2.840.10008.5.1.4.1.1.1.3.1":    "Intra-oral (processing)",
	"1.2.840.10008.5.1.4.1.1.1.2":      "Mammography (presentation)",
	"1.2.840.10008.5.1.4.1.1.2":        "CT",
	"1.2.840.10008.5.1.4.1.1.2.1":      "Enhanced CT",
	"1.2.840.10008.5.1.4.1.1.4":        "MR",
	"1.2.840.10008.5.1.4.1.1.7":        "Secondary Capture",
	"1.2.840.10008.5.1.4.1.1.7.2":      "Multi-frame Grayscale Byte SC",
	"1.2.840.10008.5.1.4.1.1.7.3":      "Multi-frame Grayscale Word SC",
	"1.2.840.10008.5.1.4.1.1.7.4":      "Multi-frame True Color SC",
	"1.2.840.10008.5.1.4.1.1.12.1":     "X-Ray Angiographic",
	"1.2.840.10008.5.1.4.1.1.13.1.1":   "X-Ray 3D Angiographic",
	"1.2.840.10008.5.1.4.1.1.13.1.2":   "X-Ray 3D Craniofacial",
	"1.2.840.10008.5.1.4.1.1.14.1":     "Intravascular OCT (presentation)",
	"1.2.840.10008.5.1.4.1.1.20":       "Nuclear Medicine",
	"1.2.840.10008.5.1.4.1.1.77.1.5.1": "Ophthalmic Photography 8",
	"1.2.840.10008.5.1.4.1.1.481.1":    "RT Image",
	"1.2.840.10008.5.1.4.1.1.6.1":      "Ultrasound",
	"1.2.840.10008.5.1.4.1.1.3.1":      "Ultrasound Multi-frame",
}

// الترميزاتُ المقبولة بترتيب الأفضلية
var dcmTransferSyntaxes = []string{
	uidExplicitLE, uidImplicitLE,
	"1.2.840.10008.1.2.4.50", // JPEG Baseline
	"1.2.840.10008.1.2.4.51", // JPEG Extended
	"1.2.840.10008.1.2.4.57", // JPEG Lossless
	"1.2.840.10008.1.2.4.70", // JPEG Lossless SV1
	"1.2.840.10008.1.2.4.80", // JPEG-LS Lossless
	"1.2.840.10008.1.2.4.81", // JPEG-LS Near-lossless
	"1.2.840.10008.1.2.4.90", // JPEG 2000 Lossless
	"1.2.840.10008.1.2.4.91", // JPEG 2000
	"1.2.840.10008.1.2.5",    // RLE
	"1.2.840.10008.1.2.2",    // Explicit Big Endian (retired but seen)
}

type dicomServer struct {
	b      *Bridge
	ln     net.Listener
	mu     sync.Mutex
	active int
	stats  struct {
		Received int
		Rejected int
		LastFrom string
		LastAt   string
	}
}

func (b *Bridge) dicomInDir() string { return filepath.Join(b.dir, "dicom-in") }

// تشغيلُ/إيقافُ المستقبِل حسب الإعدادات (يُنادى عند الإقلاع وعند تغيير الإعدادات)
func (b *Bridge) dicomApply() {
	b.mu.Lock()
	on, port, ae := b.cfg.DicomEnabled, b.cfg.DicomPort, b.cfg.DicomAE
	b.mu.Unlock()
	if port <= 0 || port > 65535 {
		port = dcmDefaultPort
	}
	if strings.TrimSpace(ae) == "" {
		ae = dcmDefaultAE
	}
	b.dcmMu.Lock()
	defer b.dcmMu.Unlock()
	if b.dcm != nil {
		b.dcm.ln.Close()
		b.dcm = nil
	}
	if !on {
		return
	}
	ln, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
	if err != nil {
		b.mu.Lock()
		b.addLog("err", fmt.Sprintf("تعذّر فتح منفذ DICOM %d: %v", port, err))
		b.mu.Unlock()
		return
	}
	_ = os.MkdirAll(b.dicomInDir(), 0o700)
	// المجلدُ الوارد يُراقَب دائماً
	b.mu.Lock()
	has := false
	for _, d := range b.cfg.WatchDirs {
		if strings.EqualFold(d, b.dicomInDir()) {
			has = true
		}
	}
	if !has {
		b.cfg.WatchDirs = append(b.cfg.WatchDirs, b.dicomInDir())
		b.save()
	}
	b.addLog("ok", fmt.Sprintf("مستقبِل DICOM يعمل — AE %s · المنفذ %d", ae, port))
	b.mu.Unlock()
	s := &dicomServer{b: b, ln: ln}
	b.dcm = s
	go s.serve(ae)
}

func (s *dicomServer) serve(ae string) {
	for {
		c, err := s.ln.Accept()
		if err != nil {
			return
		}
		go s.handle(c, ae)
	}
}

// ── PDUs ──────────────────────────────────────────────────────────
const (
	pduAssocRQ  = 0x01
	pduAssocAC  = 0x02
	pduAssocRJ  = 0x03
	pduData     = 0x04
	pduRelRQ    = 0x05
	pduRelRP    = 0x06
	pduAbort    = 0x07
	dimseCStore = 0x0001
	dimseCEcho  = 0x0030
)

func readPDU(r io.Reader) (byte, []byte, error) {
	var h [6]byte
	if _, err := io.ReadFull(r, h[:]); err != nil {
		return 0, nil, err
	}
	n := binary.BigEndian.Uint32(h[2:6])
	if n > 64<<20 {
		return 0, nil, errors.New("pdu too large")
	}
	buf := make([]byte, n)
	if _, err := io.ReadFull(r, buf); err != nil {
		return 0, nil, err
	}
	return h[0], buf, nil
}
func writePDU(w io.Writer, typ byte, body []byte) error {
	h := []byte{typ, 0, 0, 0, 0, 0}
	binary.BigEndian.PutUint32(h[2:], uint32(len(body)))
	if _, err := w.Write(h); err != nil {
		return err
	}
	_, err := w.Write(body)
	return err
}
func padUID(u string) string {
	if len(u)%2 == 1 {
		u += "\x00"
	}
	return u
}
func trimUID(b []byte) string { return strings.TrimRight(string(b), "\x00 ") }

type presCtx struct {
	id       byte
	abstract string
	transfer []string
}
type assoc struct {
	calledAE, callingAE string
	contexts            []presCtx
	maxPDU              uint32
}

func parseAssociateRQ(b []byte) (*assoc, error) {
	if len(b) < 68 {
		return nil, errors.New("short associate")
	}
	a := &assoc{calledAE: strings.TrimSpace(string(b[4:20])), callingAE: strings.TrimSpace(string(b[20:36])), maxPDU: 16384}
	p := 68
	for p+4 <= len(b) {
		typ := b[p]
		l := int(binary.BigEndian.Uint16(b[p+2 : p+4]))
		if p+4+l > len(b) {
			return nil, errors.New("bad item length")
		}
		item := b[p+4 : p+4+l]
		switch typ {
		case 0x20: // presentation context
			if len(item) < 4 {
				return nil, errors.New("bad pc")
			}
			pc := presCtx{id: item[0]}
			q := 4
			for q+4 <= len(item) {
				st := item[q]
				sl := int(binary.BigEndian.Uint16(item[q+2 : q+4]))
				if q+4+sl > len(item) {
					break
				}
				val := trimUID(item[q+4 : q+4+sl])
				if st == 0x30 {
					pc.abstract = val
				} else if st == 0x40 {
					pc.transfer = append(pc.transfer, val)
				}
				q += 4 + sl
			}
			a.contexts = append(a.contexts, pc)
		case 0x50: // user information
			q := 0
			for q+4 <= len(item) {
				st := item[q]
				sl := int(binary.BigEndian.Uint16(item[q+2 : q+4]))
				if q+4+sl > len(item) {
					break
				}
				if st == 0x51 && sl == 4 {
					a.maxPDU = binary.BigEndian.Uint32(item[q+4 : q+8])
				}
				q += 4 + sl
			}
		}
		p += 4 + l
	}
	return a, nil
}

func subItem(typ byte, val string) []byte {
	v := []byte(val)
	out := []byte{typ, 0, 0, 0}
	binary.BigEndian.PutUint16(out[2:], uint16(len(v)))
	return append(out, v...)
}

// A-ASSOCIATE-AC: يقبل كلَّ سياقٍ صنفُه معروف بأول ترميزٍ مشترك، ويرفض الباقي (3 = abstract syntax not supported)
func buildAssociateAC(a *assoc, calledAE string, accepted map[byte]string) []byte {
	var body bytes.Buffer
	body.Write([]byte{0, 1, 0, 0})
	called := fmt.Sprintf("%-16s", calledAE)
	calling := fmt.Sprintf("%-16s", a.callingAE)
	body.WriteString(called[:16])
	body.WriteString(calling[:16])
	body.Write(make([]byte, 32))
	// application context
	ac := subItem(0x10, padUID("1.2.840.10008.3.1.1.1"))
	body.Write(ac)
	for _, pc := range a.contexts {
		var item bytes.Buffer
		ts, ok := accepted[pc.id]
		result := byte(3)
		tsUID := pc.transfer[0]
		if ok {
			result = 0
			tsUID = ts
		} else if len(pc.transfer) > 0 {
			tsUID = pc.transfer[0]
			if _, known := dcmStorageClasses[pc.abstract]; known || pc.abstract == uidVerification {
				result = 4 // transfer syntaxes not supported
			}
		}
		item.Write([]byte{pc.id, 0, result, 0})
		item.Write(subItem(0x40, padUID(tsUID)))
		hdr := []byte{0x21, 0, 0, 0}
		binary.BigEndian.PutUint16(hdr[2:], uint16(item.Len()))
		body.Write(hdr)
		body.Write(item.Bytes())
	}
	// user info: max pdu, impl class uid, impl version
	var ui bytes.Buffer
	mp := []byte{0x51, 0, 0, 4, 0, 0, 0, 0}
	binary.BigEndian.PutUint32(mp[4:], dcmMaxPDU)
	ui.Write(mp)
	ui.Write(subItem(0x52, padUID(uidImplementation)))
	ui.Write(subItem(0x55, implVersionName))
	uh := []byte{0x50, 0, 0, 0}
	binary.BigEndian.PutUint16(uh[2:], uint16(ui.Len()))
	body.Write(uh)
	body.Write(ui.Bytes())
	return body.Bytes()
}

// ── DIMSE (مجموعةُ الأوامر 0000 — ضمني LE) ───────────────────────
type cmdSet struct {
	field       uint16
	msgID       uint16
	sopClass    string
	sopInstance string
	dataSetType uint16
}

func parseCommand(b []byte) (cmdSet, error) {
	var c cmdSet
	p := 0
	for p+8 <= len(b) {
		grp := binary.LittleEndian.Uint16(b[p:])
		el := binary.LittleEndian.Uint16(b[p+2:])
		l := int(binary.LittleEndian.Uint32(b[p+4:]))
		p += 8
		if l < 0 || p+l > len(b) {
			return c, errors.New("bad command element")
		}
		v := b[p : p+l]
		if grp == 0x0000 {
			switch el {
			case 0x0002:
				c.sopClass = trimUID(v)
			case 0x0100:
				if l >= 2 {
					c.field = binary.LittleEndian.Uint16(v)
				}
			case 0x0110:
				if l >= 2 {
					c.msgID = binary.LittleEndian.Uint16(v)
				}
			case 0x0800:
				if l >= 2 {
					c.dataSetType = binary.LittleEndian.Uint16(v)
				}
			case 0x1000:
				c.sopInstance = trimUID(v)
			}
		}
		p += l
	}
	return c, nil
}

func implicitElem(grp, el uint16, val []byte) []byte {
	if len(val)%2 == 1 {
		val = append(val, 0)
	}
	out := make([]byte, 8, 8+len(val))
	binary.LittleEndian.PutUint16(out[0:], grp)
	binary.LittleEndian.PutUint16(out[2:], el)
	binary.LittleEndian.PutUint32(out[4:], uint32(len(val)))
	return append(out, val...)
}
func u16(v uint16) []byte { b := make([]byte, 2); binary.LittleEndian.PutUint16(b, v); return b }

func buildResponse(c cmdSet, field uint16, status uint16) []byte {
	var body bytes.Buffer
	body.Write(implicitElem(0x0000, 0x0002, []byte(c.sopClass)))
	body.Write(implicitElem(0x0000, 0x0100, u16(field)))
	body.Write(implicitElem(0x0000, 0x0120, u16(c.msgID)))
	body.Write(implicitElem(0x0000, 0x0800, u16(0x0101)))
	body.Write(implicitElem(0x0000, 0x0900, u16(status)))
	if c.sopInstance != "" {
		body.Write(implicitElem(0x0000, 0x1000, []byte(c.sopInstance)))
	}
	gl := make([]byte, 4)
	binary.LittleEndian.PutUint32(gl, uint32(body.Len()))
	return append(implicitElem(0x0000, 0x0000, gl), body.Bytes()...)
}

// PDV واحد: [len:4][ctx:1][flags:1][data]
func pdv(ctx byte, isCmd, last bool, data []byte) []byte {
	flags := byte(0)
	if isCmd {
		flags |= 1
	}
	if last {
		flags |= 2
	}
	out := make([]byte, 6, 6+len(data))
	binary.BigEndian.PutUint32(out[0:], uint32(2+len(data)))
	out[4] = ctx
	out[5] = flags
	return append(out, data...)
}

// ── الجلسة ────────────────────────────────────────────────────────
func (s *dicomServer) handle(c net.Conn, ae string) {
	defer c.Close()
	from := c.RemoteAddr().String()
	if h, _, err := net.SplitHostPort(from); err == nil {
		from = h
	}
	_ = c.SetDeadline(time.Now().Add(dcmIdle))
	typ, body, err := readPDU(c)
	if err != nil || typ != pduAssocRQ {
		return
	}
	a, err := parseAssociateRQ(body)
	if err != nil {
		return
	}
	// AE title: نقبل عنوانَنا أو ANY-SCP/أي حروف إن تركه الجهازُ افتراضياً؛ نرفض الفارغ فقط
	if a.calledAE != "" && !strings.EqualFold(a.calledAE, ae) && !strings.EqualFold(a.calledAE, "ANY-SCP") {
		_ = writePDU(c, pduAssocRJ, []byte{0, 1, 1, 7}) // rejected permanent · user · called AE not recognized
		s.b.warn(fmt.Sprintf("DICOM: رُفض اقترانٌ من %s — عنوانُ AE المطلوب «%s» ليس «%s»", from, a.calledAE, ae))
		s.mu.Lock()
		s.stats.Rejected++
		s.mu.Unlock()
		return
	}
	accepted := map[byte]string{}
	ctxTS := map[byte]string{}
	for _, pc := range a.contexts {
		_, known := dcmStorageClasses[pc.abstract]
		if !known && pc.abstract != uidVerification {
			continue
		}
		for _, want := range dcmTransferSyntaxes {
			for _, have := range pc.transfer {
				if have == want {
					accepted[pc.id] = want
					ctxTS[pc.id] = want
					break
				}
			}
			if _, ok := accepted[pc.id]; ok {
				break
			}
		}
	}
	if err := writePDU(c, pduAssocAC, buildAssociateAC(a, ae, accepted)); err != nil {
		return
	}
	s.b.info(fmt.Sprintf("DICOM: اقترانٌ من %s (%s) — %d سياقاً مقبولاً", from, a.callingAE, len(accepted)))

	// تجميعُ PDVs لكل سياق
	type frag struct{ cmd, data bytes.Buffer }
	frags := map[byte]*frag{}
	var pending *cmdSet
	var pendingCtx byte
	for {
		_ = c.SetDeadline(time.Now().Add(dcmIdle))
		typ, body, err := readPDU(c)
		if err != nil {
			return
		}
		switch typ {
		case pduRelRQ:
			_ = writePDU(c, pduRelRP, make([]byte, 4))
			return
		case pduAbort:
			return
		case pduData:
			p := 0
			for p+6 <= len(body) {
				l := int(binary.BigEndian.Uint32(body[p:]))
				if l < 2 || p+4+l > len(body) {
					return
				}
				ctx := body[p+4]
				flags := body[p+5]
				data := body[p+6 : p+4+l]
				p += 4 + l
				f := frags[ctx]
				if f == nil {
					f = &frag{}
					frags[ctx] = f
				}
				if flags&1 == 1 {
					f.cmd.Write(data)
					if flags&2 == 2 {
						cs, err := parseCommand(f.cmd.Bytes())
						f.cmd.Reset()
						if err != nil {
							return
						}
						if cs.field == dimseCEcho {
							resp := buildResponse(cs, 0x8030, 0)
							_ = writePDU(c, pduData, pdv(ctx, true, true, resp))
							s.b.info(fmt.Sprintf("DICOM: C-ECHO من %s — تمّ", from))
							continue
						}
						if cs.field == dimseCStore {
							cc := cs
							pending, pendingCtx = &cc, ctx
							if cs.dataSetType == 0x0101 { // بلا بيانات: نردّ بخطأ
								_ = writePDU(c, pduData, pdv(ctx, true, true, buildResponse(cs, 0x8001, 0xC000)))
								pending = nil
							}
							continue
						}
						// أمرٌ غير مدعوم
						_ = writePDU(c, pduData, pdv(ctx, true, true, buildResponse(cs, cs.field|0x8000, 0x0211)))
					}
				} else {
					if f.data.Len()+len(data) > dcmMaxDataset {
						return
					}
					f.data.Write(data)
					if flags&2 == 2 {
						status := uint16(0xC000)
						if pending != nil && pendingCtx == ctx {
							if err := s.store(*pending, ctxTS[ctx], f.data.Bytes(), from, a.callingAE); err == nil {
								status = 0
							} else {
								s.b.warn("DICOM: تعذّر حفظ الصورة: " + err.Error())
							}
							_ = writePDU(c, pduData, pdv(ctx, true, true, buildResponse(*pending, 0x8001, status)))
							pending = nil
						}
						f.data.Reset()
					}
				}
			}
		default:
			return
		}
	}
}

// كتابةُ ملف Part 10: تمهيد + DICM + مجموعة 0002 (صريح LE) + مجموعةُ البيانات كما وصلت
func (s *dicomServer) store(c cmdSet, ts string, data []byte, from, callingAE string) error {
	if c.sopClass == "" || c.sopInstance == "" || len(data) == 0 {
		return errors.New("ناقص SOP UID أو البيانات")
	}
	if ts == "" {
		ts = uidImplicitLE
	}
	var meta bytes.Buffer
	exp := func(grp, el uint16, vr string, val []byte) {
		if len(val)%2 == 1 {
			if vr == "UI" {
				val = append(val, 0)
			} else {
				val = append(val, ' ')
			}
		}
		h := make([]byte, 8)
		binary.LittleEndian.PutUint16(h[0:], grp)
		binary.LittleEndian.PutUint16(h[2:], el)
		copy(h[4:6], vr)
		binary.LittleEndian.PutUint16(h[6:], uint16(len(val)))
		meta.Write(h)
		meta.Write(val)
	}
	// (0002,0001) OB version: صيغةٌ طويلة
	ver := []byte{0x02, 0x00, 0x01, 0x00, 'O', 'B', 0, 0, 2, 0, 0, 0, 0x00, 0x01}
	exp(0x0002, 0x0002, "UI", []byte(c.sopClass))
	exp(0x0002, 0x0003, "UI", []byte(c.sopInstance))
	exp(0x0002, 0x0010, "UI", []byte(ts))
	exp(0x0002, 0x0012, "UI", []byte(uidImplementation))
	exp(0x0002, 0x0013, "SH", []byte(implVersionName))
	if callingAE != "" {
		exp(0x0002, 0x0016, "AE", []byte(strings.TrimSpace(callingAE)))
	}
	groupLen := make([]byte, 4)
	binary.LittleEndian.PutUint32(groupLen, uint32(len(ver)+meta.Len()))
	var out bytes.Buffer
	out.Write(make([]byte, 128))
	out.WriteString("DICM")
	glh := []byte{0x02, 0x00, 0x00, 0x00, 'U', 'L', 4, 0}
	out.Write(glh)
	out.Write(groupLen)
	out.Write(ver)
	out.Write(meta.Bytes())
	out.Write(data)
	dir := s.b.dicomInDir()
	_ = os.MkdirAll(dir, 0o700)
	safe := strings.Map(func(r rune) rune {
		if (r >= '0' && r <= '9') || r == '.' {
			return r
		}
		return '_'
	}, c.sopInstance)
	if len(safe) > 60 {
		safe = safe[len(safe)-60:]
	}
	tmp := filepath.Join(dir, "."+safe+".part")
	final := filepath.Join(dir, time.Now().Format("20060102-150405")+"-"+safe+".dcm")
	if err := os.WriteFile(tmp, out.Bytes(), 0o600); err != nil {
		return err
	}
	if err := os.Rename(tmp, final); err != nil {
		return err
	}
	s.mu.Lock()
	s.stats.Received++
	s.stats.LastFrom = from
	s.stats.LastAt = time.Now().Format("15:04:05")
	s.mu.Unlock()
	kind := dcmStorageClasses[c.sopClass]
	s.b.info(fmt.Sprintf("DICOM: وصلت صورة %s من %s (%d KB) — ستُرفع", kind, from, len(data)/1024))
	return nil
}

// عناوينُ IP المحلية (لإعداد جهاز البانوراما)
func localIPs() []string {
	var out []string
	ifs, err := net.Interfaces()
	if err != nil {
		return out
	}
	for _, i := range ifs {
		if i.Flags&net.FlagUp == 0 || i.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, _ := i.Addrs()
		for _, a := range addrs {
			if ipn, ok := a.(*net.IPNet); ok && ipn.IP.To4() != nil {
				out = append(out, ipn.IP.String())
			}
		}
	}
	return out
}
