package main

// عاملُ TWAIN: خيطٌ واحد مقفولٌ على خيط النظام (TWAIN يطلب أن تكون نداءاتُ الجلسة من خيط النافذة نفسه)، يتلقّى
// الأعمال تباعاً: اكتشافٌ أو التقاط. الالتقاطُ التلقائي: كلُّ طلبِ التقاطٍ جديدٍ يصل بالاستطلاع ⇒ تسليحُ الحساس فوراً،
// فيصوّر الطبيبُ وتسلك الصورةُ (PNG في twain-in/ المُراقَب) مسارَ الرفع نفسَه إلى طلبه.

import (
	"errors"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

type twainJob struct {
	kind  string // discover | acquire
	opts  twainAcquireOpts
	reply chan twainReply
}
type twainReply struct {
	sources []twainSource
	result  *twainResult
	err     error
}

type twainState struct {
	mu       sync.Mutex
	jobs     chan twainJob
	busy     bool
	sources  []twainSource
	lastErr  string
	lastAt   string
	lastOK   string
	armedFor string // معرّفُ الطلب الذي سُلّح له الحساس
	seenReq  map[string]bool
}

func (b *Bridge) twainInDir() string { return filepath.Join(b.dir, "twain-in") }

func (b *Bridge) twainStart() {
	b.tw = &twainState{jobs: make(chan twainJob, 4), seenReq: map[string]bool{}}
	go b.twainWorker()
}

func (b *Bridge) twainWorker() {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	for job := range b.tw.jobs {
		b.tw.mu.Lock()
		b.tw.busy = true
		b.tw.mu.Unlock()
		var rep twainReply
		dsm, err := newTwainDSM()
		if err != nil {
			rep.err = err
		} else {
			switch job.kind {
			case "discover":
				rep.sources, rep.err = twainEnumerate(dsm)
			case "acquire":
				rep.result, rep.err = twainAcquire(dsm, job.opts)
			default:
				rep.err = errors.New("job")
			}
			dsm.Close()
		}
		b.tw.mu.Lock()
		b.tw.busy = false
		b.tw.lastAt = time.Now().Format("15:04:05")
		if rep.err != nil {
			b.tw.lastErr = rep.err.Error()
		} else {
			b.tw.lastErr = ""
			if rep.sources != nil {
				b.tw.sources = rep.sources
			}
			if rep.result != nil {
				b.tw.lastOK = time.Now().Format("15:04:05")
			}
		}
		b.tw.mu.Unlock()
		if rep.err != nil {
			b.warn("TWAIN: " + rep.err.Error())
		}
		if job.reply != nil {
			job.reply <- rep
		}
	}
}

func (b *Bridge) twainSubmit(j twainJob) bool {
	select {
	case b.tw.jobs <- j:
		return true
	default:
		return false
	}
}

// اكتشافٌ متزامن (من الواجهة)
func (b *Bridge) twainDiscover() ([]twainSource, error) {
	r := make(chan twainReply, 1)
	if !b.twainSubmit(twainJob{kind: "discover", reply: r}) {
		return nil, errors.New("الحساسُ مشغول الآن")
	}
	select {
	case rep := <-r:
		return rep.sources, rep.err
	case <-time.After(30 * time.Second):
		return nil, errors.New("الاكتشافُ تأخّر — تعريفُ الحساس لا يستجيب")
	}
}

// التقاطٌ غير متزامن (الواجهة أو الطلبُ التلقائي)
func (b *Bridge) twainAcquireAsync(reason string) bool {
	b.mu.Lock()
	src, showUI, wait := b.cfg.TwainSource, b.cfg.TwainShowUI, b.cfg.TwainWaitSec
	b.mu.Unlock()
	if wait <= 0 {
		wait = 120
	}
	_ = b.ensureWatched(b.twainInDir())
	name := "twain-" + time.Now().Format("20060102-150405")
	ok := b.twainSubmit(twainJob{kind: "acquire", opts: twainAcquireOpts{Product: src, ShowUI: showUI, Wait: time.Duration(wait) * time.Second, OutDir: b.twainInDir(), Name: name,
		Log: func(s string) { b.info(s) }}})
	if ok {
		b.info("TWAIN: بدأ الالتقاط (" + reason + ")")
	}
	return ok
}

// المجلدُ الوارد مُراقَبٌ دائماً (مثل dicom-in)
func (b *Bridge) ensureWatched(dir string) bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	for _, d := range b.cfg.WatchDirs {
		if strings.EqualFold(d, dir) {
			return false
		}
	}
	b.cfg.WatchDirs = append(b.cfg.WatchDirs, dir)
	b.save()
	return true
}

// يُنادى بعد كل استطلاعٍ ناجح: طلبٌ مفتوح جديد + الالتقاطُ التلقائي مفعّل ⇒ تسليحُ الحساس
func (b *Bridge) twainOnRequests(reqs []Request) {
	if b.tw == nil {
		return
	}
	b.mu.Lock()
	auto := b.cfg.TwainAuto && b.cfg.TwainSource != ""
	b.mu.Unlock()
	if !auto {
		return
	}
	b.tw.mu.Lock()
	var fresh *Request
	for i := range reqs {
		if !b.tw.seenReq[reqs[i].ID] {
			b.tw.seenReq[reqs[i].ID] = true
			if fresh == nil {
				fresh = &reqs[i]
			}
		}
	}
	busy := b.tw.busy
	if len(b.tw.seenReq) > 500 {
		b.tw.seenReq = map[string]bool{}
	}
	b.tw.mu.Unlock()
	if fresh != nil && !busy {
		b.twainAcquireAsync("طلبٌ من SyDent: " + fresh.PatientName)
	}
}
