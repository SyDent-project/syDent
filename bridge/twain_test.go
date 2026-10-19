package main

// محاكاةُ مدير TWAIN وتعريفِ حساس على لينكس: تُثبَت التسلسلاتُ كاملةً (OPENDSM ⇒ GETFIRST/GETNEXT ⇒ OPENDS ⇒ XFERMECH ⇒
// ENABLEDS ⇒ XFERREADY ⇒ NATIVEXFER ⇒ ENDXFER ⇒ DISABLEDS ⇒ CLOSEDS ⇒ CLOSEDSM) وترميزُ البنى وفكُّ DIB.

import (
	"encoding/binary"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"
)

type fakeDSM struct {
	t        *testing.T
	calls    []string
	sources  []string
	dsOpen   bool
	enabled  bool
	pumped   int
	readyAt  int
	dib      []byte
	globals  map[uintptr][]byte
	nextH    uintptr
	xferMech uint16
	failOpen bool
}

func newFake(t *testing.T, dib []byte) *fakeDSM {
	return &fakeDSM{t: t, sources: []string{"XIOS Sensor", "RVG 6200", "EzSensor"}, dib: dib, globals: map[uintptr][]byte{}, nextH: 100, readyAt: 3}
}
func (f *fakeDSM) rec(s string) { f.calls = append(f.calls, s) }
func (f *fakeDSM) Call(origin, dest []byte, dg uint32, dat, msg uint16, data []byte) (uint16, error) {
	switch {
	case dat == twDATIdentity && msg == twMSGGetFirst:
		f.rec("GETFIRST")
		twStr34(data[122:156], f.sources[0])
		return twRCSuccess, nil
	case dat == twDATIdentity && msg == twMSGGetNext:
		f.rec("GETNEXT")
		n := 0
		for _, c := range f.calls {
			if c == "GETNEXT" {
				n++
			}
		}
		if n >= len(f.sources) {
			return twRCEndOfList, nil
		}
		twStr34(data[122:156], f.sources[n])
		return twRCSuccess, nil
	case dat == twDATIdentity && msg == twMSGGetDefault:
		f.rec("GETDEFAULT")
		twStr34(data[122:156], f.sources[0])
		return twRCSuccess, nil
	case dat == twDATIdentity && msg == twMSGOpenDS:
		f.rec("OPENDS:" + twIdentityProduct(data))
		if f.failOpen {
			return twRCFailure, nil
		}
		f.dsOpen = true
		return twRCSuccess, nil
	case dat == twDATIdentity && msg == twMSGCloseDS:
		f.rec("CLOSEDS")
		f.dsOpen = false
		return twRCSuccess, nil
	case dat == twDATCapability && msg == twMSGSet:
		cap := binary.LittleEndian.Uint16(data[0:])
		h := uintptr(binary.LittleEndian.Uint32(data[4:]))
		ov := f.globals[h]
		f.xferMech = uint16(binary.LittleEndian.Uint32(ov[2:]))
		f.rec("SETCAP:" + map[uint16]string{twICAPXferMech: "XFERMECH"}[cap])
		return twRCSuccess, nil
	case dat == twDATUserInterface && msg == twMSGEnableDS:
		f.rec("ENABLEDS")
		if !f.dsOpen {
			return twRCFailure, nil
		}
		f.enabled = true
		return twRCSuccess, nil
	case dat == twDATUserInterface && msg == twMSGDisableDS:
		f.rec("DISABLEDS")
		f.enabled = false
		return twRCSuccess, nil
	case dat == twDATEvent && msg == twMSGProcessEvent:
		if f.enabled && f.pumped >= f.readyAt {
			binary.LittleEndian.PutUint16(data[4:], twMSGXferReady)
			return twRCDSEvent, nil
		}
		return twRCNotDSEvent, nil
	case dat == twDATPendingXfers && msg == twMSGEndXfer:
		f.rec("ENDXFER")
		binary.LittleEndian.PutUint16(data[0:], 0)
		return twRCSuccess, nil
	}
	f.t.Fatalf("unexpected Call dg=%d dat=%#x msg=%#x", dg, dat, msg)
	return twRCFailure, nil
}
func (f *fakeDSM) CallPtr(origin, dest []byte, dg uint32, dat, msg uint16, ptr *uintptr) (uint16, error) {
	switch {
	case dat == twDATParent && msg == twMSGOpenDSM:
		f.rec("OPENDSM")
		return twRCSuccess, nil
	case dat == twDATParent && msg == twMSGCloseDSM:
		f.rec("CLOSEDSM")
		return twRCSuccess, nil
	case dat == twDATImageNativeXfer && msg == twMSGGet:
		f.rec("NATIVEXFER")
		if !f.enabled {
			return twRCFailure, nil
		}
		h, _ := f.GlobalAlloc(f.dib)
		*ptr = h
		return twRCXferDone, nil
	}
	f.t.Fatalf("unexpected CallPtr dat=%#x msg=%#x", dat, msg)
	return twRCFailure, nil
}
func (f *fakeDSM) ParentHandle() uintptr { return 0x1234 }
func (f *fakeDSM) Pump(handle func(msgPtr uintptr) bool) bool {
	f.pumped++
	handle(0x5555)
	return true
}
func (f *fakeDSM) GlobalBytes(h uintptr) ([]byte, func(), error) {
	b := f.globals[h]
	return append([]byte(nil), b...), func() { delete(f.globals, h) }, nil
}
func (f *fakeDSM) GlobalAlloc(b []byte) (uintptr, error) {
	f.nextH++
	f.globals[f.nextH] = append([]byte(nil), b...)
	return f.nextH, nil
}
func (f *fakeDSM) Close() {}

// DIB رمادي 8 بت بلوحة رمادية، 5×3، سفليّ الأصل
func grayDIB8(w, h int) []byte {
	stride := ((w*8 + 31) / 32) * 4
	b := make([]byte, 40+256*4+stride*h)
	binary.LittleEndian.PutUint32(b[0:], 40)
	binary.LittleEndian.PutUint32(b[4:], uint32(w))
	binary.LittleEndian.PutUint32(b[8:], uint32(h))
	binary.LittleEndian.PutUint16(b[12:], 1)
	binary.LittleEndian.PutUint16(b[14:], 8)
	for i := 0; i < 256; i++ {
		b[40+i*4], b[40+i*4+1], b[40+i*4+2] = byte(i), byte(i), byte(i)
	}
	off := 40 + 256*4
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			b[off+y*stride+x] = byte(y*50 + x*10)
		}
	}
	return b
}

func TestEnumerate(t *testing.T) {
	f := newFake(t, nil)
	src, err := twainEnumerate(f)
	if err != nil || len(src) != 3 || src[1].Product != "RVG 6200" {
		t.Fatalf("enumerate: %v %+v", err, src)
	}
	if f.calls[0] != "OPENDSM" || f.calls[len(f.calls)-1] != "CLOSEDSM" {
		t.Fatalf("DSM not bracketed: %v", f.calls)
	}
}

func TestAcquireSequence(t *testing.T) {
	dir := t.TempDir()
	f := newFake(t, grayDIB8(5, 3))
	res, err := twainAcquire(f, twainAcquireOpts{Product: "RVG 6200", OutDir: dir, Name: "shot1", Wait: 5 * time.Second})
	if err != nil {
		t.Fatalf("acquire: %v calls=%v", err, f.calls)
	}
	want := []string{"OPENDSM", "GETFIRST", "GETNEXT", "GETNEXT", "GETNEXT", "OPENDS:RVG 6200", "SETCAP:XFERMECH", "ENABLEDS", "NATIVEXFER", "ENDXFER", "DISABLEDS", "CLOSEDS", "CLOSEDSM"}
	if len(f.calls) != len(want) {
		t.Fatalf("calls %v", f.calls)
	}
	for i := range want {
		if f.calls[i] != want[i] {
			t.Fatalf("step %d: got %s want %s (all %v)", i, f.calls[i], want[i], f.calls)
		}
	}
	if f.xferMech != twSXNative {
		t.Fatalf("xfermech %d", f.xferMech)
	}
	if res.Width != 5 || res.Height != 3 || res.Bits != 8 {
		t.Fatalf("result %+v", res)
	}
	fh, _ := os.Open(filepath.Join(dir, "shot1.png"))
	img, err := png.Decode(fh)
	fh.Close()
	if err != nil {
		t.Fatal(err)
	}
	// السطرُ الأول بالصورة = السطرُ الأخير بالـDIB (سفليّ الأصل): y=2 ⇒ 100 + x*10
	r, _, _, _ := img.At(2, 0).RGBA()
	if r>>8 != 120 {
		t.Fatalf("pixel order wrong: %d", r>>8)
	}
	if len(f.globals) != 0 {
		t.Fatalf("HGLOBAL leaked: %d", len(f.globals))
	}
	if _, err := os.Stat(filepath.Join(dir, ".shot1.part")); err == nil {
		t.Fatal("temp file left")
	}
}

func TestAcquireTimeoutAndErrors(t *testing.T) {
	f := newFake(t, grayDIB8(2, 2))
	f.readyAt = 1 << 30
	_, err := twainAcquire(f, twainAcquireOpts{OutDir: t.TempDir(), Wait: 300 * time.Millisecond})
	if err == nil || f.calls[len(f.calls)-1] != "CLOSEDSM" {
		t.Fatalf("timeout should close everything: %v %v", err, f.calls)
	}
	seen := map[string]bool{}
	for _, c := range f.calls {
		seen[c] = true
	}
	if !seen["DISABLEDS"] || !seen["CLOSEDS"] {
		t.Fatalf("not disabled/closed on timeout: %v", f.calls)
	}
	f2 := newFake(t, nil)
	_, err = twainAcquire(f2, twainAcquireOpts{Product: "Nope", OutDir: t.TempDir(), Wait: time.Second})
	if err == nil || f2.calls[len(f2.calls)-1] != "CLOSEDSM" {
		t.Fatalf("unknown source: %v %v", err, f2.calls)
	}
	f3 := newFake(t, nil)
	f3.failOpen = true
	_, err = twainAcquire(f3, twainAcquireOpts{OutDir: t.TempDir(), Wait: time.Second})
	if err == nil {
		t.Fatal("failOpen should error")
	}
}

func TestIdentityLayout(t *testing.T) {
	b := twAppIdentity()
	if len(b) != 156 || binary.LittleEndian.Uint16(b[46:]) != 1 || binary.LittleEndian.Uint16(b[48:]) != 9 || binary.LittleEndian.Uint32(b[50:]) != 3 {
		t.Fatalf("identity layout")
	}
	if twIdentityProduct(b) != "SyDent Bridge" {
		t.Fatalf("product %q", twIdentityProduct(b))
	}
	ui := twUserInterface(true, 0xABCD)
	if binary.LittleEndian.Uint16(ui[0:]) != 1 || binary.LittleEndian.Uint32(ui[4:]) != 0xABCD {
		t.Fatal("ui layout")
	}
}

func TestDIBVariants(t *testing.T) {
	// 16 بت رمادي بقيمٍ 12 بت ⇒ يُمدَّد
	w, h := 4, 2
	stride := ((w*16 + 31) / 32) * 4
	b := make([]byte, 40+stride*h)
	binary.LittleEndian.PutUint32(b[0:], 40)
	binary.LittleEndian.PutUint32(b[4:], uint32(w))
	binary.LittleEndian.PutUint32(b[8:], uint32(-h)) // علويُّ الأصل
	binary.LittleEndian.PutUint16(b[12:], 1)
	binary.LittleEndian.PutUint16(b[14:], 16)
	binary.LittleEndian.PutUint16(b[40:], 4095)
	img, bits, err := dibToImage(b)
	if err != nil || bits != 16 {
		t.Fatal(err, bits)
	}
	r, _, _, _ := img.At(0, 0).RGBA()
	if r != 65535 {
		t.Fatalf("12-bit stretch: %d", r)
	}
	// 24 بت
	stride = ((w*24 + 31) / 32) * 4
	c := make([]byte, 40+stride*h)
	binary.LittleEndian.PutUint32(c[0:], 40)
	binary.LittleEndian.PutUint32(c[4:], uint32(w))
	binary.LittleEndian.PutUint32(c[8:], uint32(h))
	binary.LittleEndian.PutUint16(c[12:], 1)
	binary.LittleEndian.PutUint16(c[14:], 24)
	c[40+stride*(h-1)+0], c[40+stride*(h-1)+1], c[40+stride*(h-1)+2] = 10, 20, 30 // BGR للبكسل (0,0)
	img, bits, err = dibToImage(c)
	if err != nil || bits != 24 {
		t.Fatal(err)
	}
	r, g, bl, _ := img.At(0, 0).RGBA()
	if r>>8 != 30 || g>>8 != 20 || bl>>8 != 10 {
		t.Fatalf("BGR order: %d %d %d", r>>8, g>>8, bl>>8)
	}
	if _, _, err := dibToImage([]byte{1, 2, 3}); err == nil {
		t.Fatal("short DIB accepted")
	}
	// BITMAPV4HEADER (108) + BITFIELDS 32 بت: الأقنعةُ داخل الترويسة — لا إزاحةَ إضافية
	stride = w * 4
	v4 := make([]byte, 108+stride*h)
	binary.LittleEndian.PutUint32(v4[0:], 108)
	binary.LittleEndian.PutUint32(v4[4:], uint32(w))
	binary.LittleEndian.PutUint32(v4[8:], uint32(-h))
	binary.LittleEndian.PutUint16(v4[12:], 1)
	binary.LittleEndian.PutUint16(v4[14:], 32)
	binary.LittleEndian.PutUint32(v4[16:], 3)
	v4[108+0], v4[108+1], v4[108+2] = 1, 2, 3
	img, bits, err = dibToImage(v4)
	if err != nil || bits != 32 {
		t.Fatal(err)
	}
	r, g, bl, _ = img.At(0, 0).RGBA()
	if r>>8 != 3 || g>>8 != 2 || bl>>8 != 1 {
		t.Fatalf("V4 header offset: %d %d %d", r>>8, g>>8, bl>>8)
	}
}
