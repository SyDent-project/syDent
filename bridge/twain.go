package main

// TWAIN — ربط الأجهزة ٤ (v1.2.0): الالتقاطُ من الحساس مباشرةً عبر تعريفه (Data Source) بلا برنامج الشركة.
//
// التصميم: هذا الملفُّ لا يلمس ويندوز — فيه ترميزُ بنى TWAIN (pack(2) · 32-bit)، وآلةُ الحالة، وفكُّ DIB إلى PNG.
// ما يحتاج ويندوز (تحميلُ twain_32.dll/TWAINDSM.dll · نافذةٌ مخفية · حلقةُ الرسائل · GlobalLock) يمرّ عبر الواجهة
// `twainDSM` التي ينفّذها twain_windows.go، وتُحاكى على لينكس بالاختبار (twain_test.go) فتُثبَت التسلسلاتُ كاملةً.
// البرنامجُ يُبنى 32-bit (GOARCH=386) لأن أغلبَ تعريفات الحساسات السنية 32-bit ولا يحمّلها تطبيقٌ 64-bit.
//
// التسلسل (TWAIN 1.9، مع DSM 1.x أو 2.x): OPENDSM ⇒ (GETFIRST/GETNEXT للاكتشاف) ⇒ OPENDS ⇒ ICAP_XFERMECH=NATIVE ⇒
// ENABLEDS(ShowUI) ⇒ حلقةُ رسائل تمرّر كلَّ رسالة إلى DS (DAT_EVENT/MSG_PROCESSEVENT) حتى MSG_XFERREADY ⇒
// IMAGENATIVEXFER ⇒ DIB في HGLOBAL ⇒ PNG ⇒ ENDXFER ⇒ (Count=0) DISABLEDS ⇒ CLOSEDS ⇒ CLOSEDSM.

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// ── الثوابت ─────────────────────────────────────────────────────
const (
	twDGControl = 0x0001
	twDGImage   = 0x0002

	twDATCapability      = 0x0001
	twDATEvent           = 0x0002
	twDATIdentity        = 0x0003
	twDATParent          = 0x0004
	twDATPendingXfers    = 0x0005
	twDATStatus          = 0x0008
	twDATUserInterface   = 0x0009
	twDATImageInfo       = 0x0101
	twDATImageNativeXfer = 0x0104

	twMSGGet          = 0x0001
	twMSGGetDefault   = 0x0003
	twMSGGetFirst     = 0x0004
	twMSGGetNext      = 0x0005
	twMSGSet          = 0x0006
	twMSGXferReady    = 0x0101
	twMSGCloseDSReq   = 0x0102
	twMSGCloseDSOK    = 0x0103
	twMSGOpenDSM      = 0x0301
	twMSGCloseDSM     = 0x0302
	twMSGOpenDS       = 0x0401
	twMSGCloseDS      = 0x0402
	twMSGDisableDS    = 0x0501
	twMSGEnableDS     = 0x0502
	twMSGProcessEvent = 0x0601
	twMSGEndXfer      = 0x0701

	twRCSuccess    = 0
	twRCFailure    = 1
	twRCCancel     = 3
	twRCDSEvent    = 4
	twRCNotDSEvent = 5
	twRCXferDone   = 6
	twRCEndOfList  = 7

	twICAPXferMech = 0x1103
	twSXNative     = 0
	twONOneValue   = 5
	twTYUint16     = 4

	twIdentitySize = 156
	twDefaultWait  = 120 * time.Second
)

// واجهةُ ويندوز — ما لا يُختبر إلا هناك
type twainDSM interface {
	// Call ينادي DSM_Entry: origin/dest مخازنُ TW_IDENTITY (156 بايت) أو nil، وdata مخزنُ البيانات (أو nil)
	Call(origin, dest []byte, dg uint32, dat, msg uint16, data []byte) (uint16, error)
	// CallPtr: مثلُ Call لكن pData مؤشّرٌ خام (HWND لـDAT_PARENT · hDIB لـNATIVEXFER)
	CallPtr(origin, dest []byte, dg uint32, dat, msg uint16, ptr *uintptr) (uint16, error)
	ParentHandle() uintptr                         // HWND النافذة المخفية (uint32 على 32-bit)
	Pump(handle func(msgPtr uintptr) bool) bool    // رسالةٌ واحدة إن وُجدت ⇒ handle(&MSG) ⇒ true إن وُجدت رسالة
	GlobalBytes(h uintptr) ([]byte, func(), error) // قفلُ HGLOBAL ⇒ محتواه + فكٌّ/تحرير
	GlobalAlloc(b []byte) (uintptr, error)
	Close()
}

// ── ترميزُ البنى (pack(2)، Little Endian، مؤشّراتٌ 32-bit) ─────────
func twStr34(dst []byte, s string) {
	for i := range dst {
		dst[i] = 0
	}
	copy(dst, []byte(s))
	dst[len(dst)-1] = 0
}
func twCStr(b []byte) string {
	if i := bytes.IndexByte(b, 0); i >= 0 {
		b = b[:i]
	}
	return strings.TrimSpace(string(b))
}

// TW_IDENTITY: Id(4) Version{Major2 Minor2 Lang2 Country2 Info34} Major2 Minor2 Groups4 Manufacturer34 Family34 Product34 = 156
func twAppIdentity() []byte {
	b := make([]byte, twIdentitySize)
	binary.LittleEndian.PutUint16(b[4:], 1)  // version major
	binary.LittleEndian.PutUint16(b[6:], 2)  // version minor
	binary.LittleEndian.PutUint16(b[8:], 13) // TWLG_ENGLISH_USA
	binary.LittleEndian.PutUint16(b[10:], 1) // TWCY_USA
	twStr34(b[12:46], "SyDent Bridge "+Version)
	binary.LittleEndian.PutUint16(b[46:], 1) // protocol major
	binary.LittleEndian.PutUint16(b[48:], 9) // protocol minor
	binary.LittleEndian.PutUint32(b[50:], twDGControl|twDGImage)
	twStr34(b[54:88], "SyDent")
	twStr34(b[88:122], "SyDent Bridge")
	twStr34(b[122:156], "SyDent Bridge")
	return b
}
func twIdentityProduct(b []byte) string      { return twCStr(b[122:156]) }
func twIdentityManufacturer(b []byte) string { return twCStr(b[54:88]) }

// TW_CAPABILITY: Cap2 ConType2 hContainer4 = 8 · TW_ONEVALUE: ItemType2 Item4 = 6
func twCapOneValueU16(dsm twainDSM, cap uint16, val uint16) ([]byte, uintptr, error) {
	ov := make([]byte, 6)
	binary.LittleEndian.PutUint16(ov[0:], twTYUint16)
	binary.LittleEndian.PutUint32(ov[2:], uint32(val))
	h, err := dsm.GlobalAlloc(ov)
	if err != nil {
		return nil, 0, err
	}
	c := make([]byte, 8)
	binary.LittleEndian.PutUint16(c[0:], cap)
	binary.LittleEndian.PutUint16(c[2:], twONOneValue)
	binary.LittleEndian.PutUint32(c[4:], uint32(h))
	return c, h, nil
}

// TW_USERINTERFACE: ShowUI2 ModalUI2 hParent4 = 8
func twUserInterface(showUI bool, parent uintptr) []byte {
	b := make([]byte, 8)
	if showUI {
		binary.LittleEndian.PutUint16(b[0:], 1)
	}
	binary.LittleEndian.PutUint32(b[4:], uint32(parent))
	return b
}

// TW_EVENT: pEvent4 TWMessage2 = 6 — pEvent يشير إلى MSG (28 بايت على 32-bit)
func twEvent(msgPtr uintptr) []byte {
	b := make([]byte, 8)
	binary.LittleEndian.PutUint32(b[0:], uint32(msgPtr))
	return b
}
func twEventMessage(b []byte) uint16 { return binary.LittleEndian.Uint16(b[4:]) }

// ── الحالة والنتيجة ──────────────────────────────────────────────
type twainSource struct {
	Product      string `json:"product"`
	Manufacturer string `json:"manufacturer"`
	Identity     []byte `json:"-"`
}

type twainResult struct {
	Path   string
	Width  int
	Height int
	Bits   int
}

// ── الاكتشاف ───────────────────────────────────────────────────
func twainEnumerate(dsm twainDSM) ([]twainSource, error) {
	app := twAppIdentity()
	hwnd := dsm.ParentHandle()
	if rc, err := dsm.CallPtr(app, nil, twDGControl, twDATParent, twMSGOpenDSM, &hwnd); err != nil || rc != twRCSuccess {
		return nil, fmt.Errorf("تعذّر فتح مدير TWAIN (rc=%d)", rc)
	}
	defer dsm.CallPtr(app, nil, twDGControl, twDATParent, twMSGCloseDSM, &hwnd)
	var out []twainSource
	ident := make([]byte, twIdentitySize)
	rc, err := dsm.Call(app, nil, twDGControl, twDATIdentity, twMSGGetFirst, ident)
	for err == nil && rc == twRCSuccess {
		cp := append([]byte(nil), ident...)
		out = append(out, twainSource{Product: twIdentityProduct(cp), Manufacturer: twIdentityManufacturer(cp), Identity: cp})
		ident = make([]byte, twIdentitySize)
		rc, err = dsm.Call(app, nil, twDGControl, twDATIdentity, twMSGGetNext, ident)
		if len(out) > 64 {
			break
		}
	}
	if err != nil {
		return nil, err
	}
	return out, nil
}

// ── الالتقاط ───────────────────────────────────────────────────
type twainAcquireOpts struct {
	Product string        // اسمُ المنتج كما ورد بالاكتشاف؛ فارغٌ = الافتراضي
	ShowUI  bool          // إظهارُ واجهة التعريف (بعضُ الحساسات تحتاجها)
	Wait    time.Duration // مهلةُ انتظار التصوير
	OutDir  string        // أين يُحفظ PNG
	Name    string        // اسمُ الملف بلا امتداد
	Log     func(string)
}

func twainAcquire(dsm twainDSM, o twainAcquireOpts) (*twainResult, error) {
	logf := o.Log
	if logf == nil {
		logf = func(string) {}
	}
	if o.Wait <= 0 {
		o.Wait = twDefaultWait
	}
	app := twAppIdentity()
	hwnd := dsm.ParentHandle()
	if rc, err := dsm.CallPtr(app, nil, twDGControl, twDATParent, twMSGOpenDSM, &hwnd); err != nil || rc != twRCSuccess {
		return nil, fmt.Errorf("تعذّر فتح مدير TWAIN (rc=%d) — هل تعريفُ الحساس مثبّت؟", rc)
	}
	defer dsm.CallPtr(app, nil, twDGControl, twDATParent, twMSGCloseDSM, &hwnd)

	// اختيارُ المصدر
	ds := make([]byte, twIdentitySize)
	if o.Product != "" {
		list, err := func() ([]twainSource, error) { // بالقائمة الحالية (DSM مفتوحٌ بالفعل)
			var out []twainSource
			ident := make([]byte, twIdentitySize)
			rc, err := dsm.Call(app, nil, twDGControl, twDATIdentity, twMSGGetFirst, ident)
			for err == nil && rc == twRCSuccess && len(out) < 64 {
				cp := append([]byte(nil), ident...)
				out = append(out, twainSource{Product: twIdentityProduct(cp), Identity: cp})
				ident = make([]byte, twIdentitySize)
				rc, err = dsm.Call(app, nil, twDGControl, twDATIdentity, twMSGGetNext, ident)
			}
			return out, err
		}()
		if err != nil {
			return nil, err
		}
		found := false
		for _, s := range list {
			if strings.EqualFold(s.Product, o.Product) {
				ds = s.Identity
				found = true
				break
			}
		}
		if !found {
			return nil, fmt.Errorf("جهاز TWAIN «%s» غير موجود الآن — أعد الاكتشاف واختر من القائمة", o.Product)
		}
	} else {
		if rc, err := dsm.Call(app, nil, twDGControl, twDATIdentity, twMSGGetDefault, ds); err != nil || rc != twRCSuccess {
			return nil, errors.New("لا جهاز TWAIN افتراضياً — اضغط «اكتشاف الأجهزة» واختر الحساس")
		}
	}
	if rc, err := dsm.Call(app, nil, twDGControl, twDATIdentity, twMSGOpenDS, ds); err != nil || rc != twRCSuccess {
		return nil, fmt.Errorf("تعذّر فتح تعريف الحساس «%s» (rc=%d) — هل هو موصولٌ ومشغّل؟", twIdentityProduct(ds), rc)
	}
	dsOpen := true
	closeDS := func() {
		if dsOpen {
			dsm.Call(app, nil, twDGControl, twDATIdentity, twMSGCloseDS, ds)
			dsOpen = false
		}
	}
	defer closeDS()
	logf("TWAIN: فُتح «" + twIdentityProduct(ds) + "»")

	// آليةُ النقل: NATIVE (DIB بالذاكرة)
	capBuf, hCap, err := twCapOneValueU16(dsm, twICAPXferMech, twSXNative)
	if err == nil {
		rc, _ := dsm.Call(app, ds, twDGControl, twDATCapability, twMSGSet, capBuf)
		if _, free, e := dsm.GlobalBytes(hCap); e == nil {
			free()
		}
		if rc != twRCSuccess {
			logf("TWAIN: التعريفُ لم يقبل النقلَ الأصلي صراحةً — نتابع بالافتراضي")
		}
	}

	// تفعيلُ المصدر وانتظارُ التصوير
	ui := twUserInterface(o.ShowUI, hwnd)
	if rc, err := dsm.Call(app, ds, twDGControl, twDATUserInterface, twMSGEnableDS, ui); err != nil || (rc != twRCSuccess && rc != 2 /* CHECKSTATUS */) {
		return nil, fmt.Errorf("تعذّر تفعيل الحساس (rc=%d)", rc)
	}
	enabled := true
	disable := func() {
		if enabled {
			dsm.Call(app, ds, twDGControl, twDATUserInterface, twMSGDisableDS, ui)
			enabled = false
		}
	}
	defer disable()
	logf("TWAIN: الحساسُ مفعّل — صوّر الآن (المهلة " + fmt.Sprint(int(o.Wait.Seconds())) + " ث)")

	deadline := time.Now().Add(o.Wait)
	var twMsg uint16
	for time.Now().Before(deadline) {
		got := dsm.Pump(func(msgPtr uintptr) bool {
			ev := twEvent(msgPtr)
			rc, _ := dsm.Call(app, ds, twDGControl, twDATEvent, twMSGProcessEvent, ev)
			if rc == twRCDSEvent {
				twMsg = twEventMessage(ev)
				return true
			}
			return false
		})
		if twMsg == twMSGXferReady {
			break
		}
		if twMsg == twMSGCloseDSReq || twMsg == twMSGCloseDSOK {
			return nil, errors.New("أُغلق تعريفُ الحساس قبل التصوير (أُلغي من واجهته؟)")
		}
		if !got {
			time.Sleep(10 * time.Millisecond)
		}
	}
	if twMsg != twMSGXferReady {
		return nil, errors.New("انتهت المهلة بلا صورة — لم يُصوَّر أو الحساسُ لم يستجب")
	}

	// النقل
	var hDIB uintptr
	rc, err := dsm.CallPtr(app, ds, twDGImage, twDATImageNativeXfer, twMSGGet, &hDIB)
	if err != nil || rc != twRCXferDone || hDIB == 0 {
		dsm.Call(app, ds, twDGControl, twDATPendingXfers, twMSGEndXfer, make([]byte, 6))
		return nil, fmt.Errorf("فشل نقلُ الصورة من الحساس (rc=%d)", rc)
	}
	dib, free, err := dsm.GlobalBytes(hDIB)
	if err != nil {
		return nil, err
	}
	img, bits, err := dibToImage(dib)
	free()
	if err != nil {
		return nil, err
	}
	// إنهاءُ النقل (قد تبقى صورٌ معلّقة — نأخذ الأولى فقط)
	pend := make([]byte, 6)
	dsm.Call(app, ds, twDGControl, twDATPendingXfers, twMSGEndXfer, pend)
	disable()
	closeDS()

	_ = os.MkdirAll(o.OutDir, 0o700)
	name := o.Name
	if name == "" {
		name = "twain-" + time.Now().Format("20060102-150405")
	}
	tmp := filepath.Join(o.OutDir, "."+name+".part")
	final := filepath.Join(o.OutDir, name+".png")
	f, err := os.Create(tmp)
	if err != nil {
		return nil, err
	}
	enc := png.Encoder{CompressionLevel: png.BestSpeed}
	if err := enc.Encode(f, img); err != nil {
		f.Close()
		os.Remove(tmp)
		return nil, err
	}
	f.Close()
	if err := os.Rename(tmp, final); err != nil {
		return nil, err
	}
	b := img.Bounds()
	logf(fmt.Sprintf("TWAIN: وصلت صورة %d×%d (%d بت) — ستُرفع", b.Dx(), b.Dy(), bits))
	return &twainResult{Path: final, Width: b.Dx(), Height: b.Dy(), Bits: bits}, nil
}

// ── DIB ⇒ image ─────────────────────────────────────────────────
// BITMAPINFOHEADER (40): biSize4 biWidth4 biHeight4 biPlanes2 biBitCount2 biCompression4 biSizeImage4 XPels4 YPels4 biClrUsed4 biClrImportant4
func dibToImage(d []byte) (image.Image, int, error) {
	if len(d) < 40 {
		return nil, 0, errors.New("DIB ناقص")
	}
	hdr := int(binary.LittleEndian.Uint32(d[0:]))
	if hdr < 40 || hdr > len(d) {
		return nil, 0, errors.New("ترويسةُ DIB غير معروفة")
	}
	w := int(int32(binary.LittleEndian.Uint32(d[4:])))
	h := int(int32(binary.LittleEndian.Uint32(d[8:])))
	bpp := int(binary.LittleEndian.Uint16(d[14:]))
	comp := binary.LittleEndian.Uint32(d[16:])
	clrUsed := int(binary.LittleEndian.Uint32(d[32:]))
	if w <= 0 || h == 0 || w > 20000 || h > 20000 || h < -20000 {
		return nil, 0, errors.New("أبعادُ DIB غير معقولة")
	}
	topDown := h < 0
	if topDown {
		h = -h
	}
	if comp != 0 && !(comp == 3 && (bpp == 16 || bpp == 32)) {
		return nil, 0, fmt.Errorf("DIB مضغوط (%d) غير مدعوم", comp)
	}
	pal := 0
	if bpp <= 8 {
		pal = clrUsed
		if pal == 0 {
			pal = 1 << uint(bpp)
		}
	}
	masks := 0
	if comp == 3 && hdr < 52 { // BITFIELDS مع BITMAPINFOHEADER: الأقنعةُ بعد الترويسة؛ في V4/V5 (≥ 108) هي داخلها
		masks = 12
	}
	off := hdr + masks + pal*4
	stride := ((w*bpp + 31) / 32) * 4
	if off+stride*h > len(d) {
		return nil, 0, errors.New("بياناتُ DIB أقصر من أبعادها")
	}
	palette := d[hdr+masks : hdr+masks+pal*4]
	row := func(y int) []byte {
		if !topDown {
			y = h - 1 - y
		}
		return d[off+y*stride : off+(y+1)*stride]
	}
	switch bpp {
	case 8:
		gray := true
		for i := 0; i < pal; i++ {
			if palette[i*4] != palette[i*4+1] || palette[i*4] != palette[i*4+2] {
				gray = false
				break
			}
		}
		if gray {
			img := image.NewGray(image.Rect(0, 0, w, h))
			for y := 0; y < h; y++ {
				r := row(y)
				for x := 0; x < w; x++ {
					idx := int(r[x])
					if idx < pal {
						img.Pix[y*img.Stride+x] = palette[idx*4]
					}
				}
			}
			return img, 8, nil
		}
		img := image.NewRGBA(image.Rect(0, 0, w, h))
		for y := 0; y < h; y++ {
			r := row(y)
			for x := 0; x < w; x++ {
				idx := int(r[x])
				if idx < pal {
					img.SetRGBA(x, y, color.RGBA{palette[idx*4+2], palette[idx*4+1], palette[idx*4], 255})
				}
			}
		}
		return img, 8, nil
	case 16:
		// الحساساتُ السنية تعطي 12–16 بت رمادياً بهذا العمق؛ RGB555 نادرٌ هنا ⇒ نعامله رمادياً 16 بت
		img := image.NewGray16(image.Rect(0, 0, w, h))
		maxv := uint16(0)
		for y := 0; y < h; y++ {
			r := row(y)
			for x := 0; x < w; x++ {
				v := binary.LittleEndian.Uint16(r[x*2:])
				if v > maxv {
					maxv = v
				}
				img.Pix[y*img.Stride+x*2] = byte(v >> 8)
				img.Pix[y*img.Stride+x*2+1] = byte(v)
			}
		}
		// 12 بت فعلياً ⇒ نمدّد إلى 16 كي لا تبدو الصورةُ سوداء
		if maxv > 0 && maxv < 4096 {
			for i := 0; i+1 < len(img.Pix); i += 2 {
				v := uint32(img.Pix[i])<<8 | uint32(img.Pix[i+1])
				v = v * 65535 / uint32(maxv)
				img.Pix[i] = byte(v >> 8)
				img.Pix[i+1] = byte(v)
			}
		}
		return img, 16, nil
	case 24, 32:
		step := bpp / 8
		img := image.NewRGBA(image.Rect(0, 0, w, h))
		for y := 0; y < h; y++ {
			r := row(y)
			for x := 0; x < w; x++ {
				p := r[x*step:]
				img.SetRGBA(x, y, color.RGBA{p[2], p[1], p[0], 255})
			}
		}
		return img, bpp, nil
	}
	return nil, 0, fmt.Errorf("عمقُ DIB %d بت غير مدعوم", bpp)
}
