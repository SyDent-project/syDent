//go:build windows

package main

// تنفيذُ واجهة twainDSM على ويندوز (32-bit): تحميلُ TWAINDSM.dll أو twain_32.dll · نافذةٌ مخفية · ضخُّ الرسائل · HGLOBAL.
// كلُّ نداءات DSM لجلسةٍ واحدة تجري من الخيط نفسه الذي أنشأ النافذة (runtime.LockOSThread في twainWorker).

import (
	"errors"
	"runtime"
	"syscall"
	"unsafe"
)

var (
	user32            = syscall.NewLazyDLL("user32.dll")
	kernel32          = syscall.NewLazyDLL("kernel32.dll")
	pCreateWindowExW  = user32.NewProc("CreateWindowExW")
	pDestroyWindow    = user32.NewProc("DestroyWindow")
	pPeekMessageW     = user32.NewProc("PeekMessageW")
	pTranslateMessage = user32.NewProc("TranslateMessage")
	pDispatchMessageW = user32.NewProc("DispatchMessageW")
	pGetModuleHandleW = kernel32.NewProc("GetModuleHandleW")
	pGlobalAlloc      = kernel32.NewProc("GlobalAlloc")
	pGlobalLock       = kernel32.NewProc("GlobalLock")
	pGlobalUnlock     = kernel32.NewProc("GlobalUnlock")
	pGlobalFree       = kernel32.NewProc("GlobalFree")
	pGlobalSize       = kernel32.NewProc("GlobalSize")
	pRtlMoveMemory    = kernel32.NewProc("RtlMoveMemory") // نسخٌ من/إلى ذاكرة ويندوز بلا تحويل uintptr⇄Pointer (vet نظيف)
)

type winMSG struct {
	Hwnd    uintptr
	Message uint32
	WParam  uintptr
	LParam  uintptr
	Time    uint32
	PtX     int32
	PtY     int32
}

type winTwain struct {
	dll   *syscall.DLL
	entry *syscall.Proc
	hwnd  uintptr
	name  string
}

func newTwainDSM() (twainDSM, error) {
	var dll *syscall.DLL
	var err error
	name := ""
	for _, n := range []string{"TWAINDSM.dll", "twain_32.dll"} {
		dll, err = syscall.LoadDLL(n)
		if err == nil {
			name = n
			break
		}
	}
	if dll == nil {
		return nil, errors.New("لا مدير TWAIN على هذا الكمبيوتر (TWAINDSM.dll / twain_32.dll) — ثبّت تعريف الحساس من شركته")
	}
	entry, err := dll.FindProc("DSM_Entry")
	if err != nil {
		dll.Release()
		return nil, errors.New("مدير TWAIN بلا DSM_Entry")
	}
	hInst, _, _ := pGetModuleHandleW.Call(0)
	cls, _ := syscall.UTF16PtrFromString("STATIC")
	title, _ := syscall.UTF16PtrFromString("SyDent Bridge TWAIN")
	const wsPopup = 0x80000000
	hwnd, _, _ := pCreateWindowExW.Call(0, uintptr(unsafe.Pointer(cls)), uintptr(unsafe.Pointer(title)), wsPopup, 0, 0, 0, 0, 0, 0, hInst, 0)
	if hwnd == 0 {
		dll.Release()
		return nil, errors.New("تعذّر إنشاء نافذة TWAIN المخفية")
	}
	return &winTwain{dll: dll, entry: entry, hwnd: hwnd, name: name}, nil
}

func bptr(b []byte) uintptr {
	if len(b) == 0 {
		return 0
	}
	return uintptr(unsafe.Pointer(&b[0]))
}

func (w *winTwain) Call(origin, dest []byte, dg uint32, dat, msg uint16, data []byte) (uint16, error) {
	r, _, _ := w.entry.Call(bptr(origin), bptr(dest), uintptr(dg), uintptr(dat), uintptr(msg), bptr(data))
	// المخازنُ تبقى حيّةً طوال النداء (المؤشّراتُ مرّت كـuintptr فلا يراها جامعُ القمامة)
	runtime.KeepAlive(origin)
	runtime.KeepAlive(dest)
	runtime.KeepAlive(data)
	return uint16(r), nil
}
func (w *winTwain) CallPtr(origin, dest []byte, dg uint32, dat, msg uint16, ptr *uintptr) (uint16, error) {
	r, _, _ := w.entry.Call(bptr(origin), bptr(dest), uintptr(dg), uintptr(dat), uintptr(msg), uintptr(unsafe.Pointer(ptr)))
	runtime.KeepAlive(origin)
	runtime.KeepAlive(dest)
	runtime.KeepAlive(ptr)
	return uint16(r), nil
}
func (w *winTwain) ParentHandle() uintptr { return w.hwnd }

func (w *winTwain) Pump(handle func(msgPtr uintptr) bool) bool {
	var m winMSG
	const pmRemove = 1
	r, _, _ := pPeekMessageW.Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0, pmRemove)
	if r == 0 {
		return false
	}
	if !handle(uintptr(unsafe.Pointer(&m))) {
		pTranslateMessage.Call(uintptr(unsafe.Pointer(&m)))
		pDispatchMessageW.Call(uintptr(unsafe.Pointer(&m)))
	}
	runtime.KeepAlive(&m)
	return true
}

func (w *winTwain) GlobalBytes(h uintptr) ([]byte, func(), error) {
	size, _, _ := pGlobalSize.Call(h)
	if size == 0 {
		return nil, nil, errors.New("HGLOBAL فارغ")
	}
	p, _, _ := pGlobalLock.Call(h)
	if p == 0 {
		return nil, nil, errors.New("تعذّر قفل HGLOBAL")
	}
	cp := make([]byte, int(size))
	pRtlMoveMemory.Call(uintptr(unsafe.Pointer(&cp[0])), p, size)
	pGlobalUnlock.Call(h)
	free := func() { pGlobalFree.Call(h) }
	return cp, free, nil
}

func (w *winTwain) GlobalAlloc(b []byte) (uintptr, error) {
	const ghnd = 0x42
	h, _, _ := pGlobalAlloc.Call(ghnd, uintptr(len(b)))
	if h == 0 {
		return 0, errors.New("GlobalAlloc فشل")
	}
	p, _, _ := pGlobalLock.Call(h)
	if p == 0 {
		pGlobalFree.Call(h)
		return 0, errors.New("GlobalLock فشل")
	}
	if len(b) > 0 {
		pRtlMoveMemory.Call(p, uintptr(unsafe.Pointer(&b[0])), uintptr(len(b)))
	}
	pGlobalUnlock.Call(h)
	return h, nil
}

func (w *winTwain) Close() {
	if w.hwnd != 0 {
		pDestroyWindow.Call(w.hwnd)
		w.hwnd = 0
	}
	if w.dll != nil {
		w.dll.Release()
		w.dll = nil
	}
}
