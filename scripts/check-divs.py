#!/usr/bin/env python3
# SyDent — check-divs.py: توازن وسوم div بكل صفحات HTML. الاستخدام: python3 scripts/check-divs.py
import sys, glob, os
from html.parser import HTMLParser

class DivCounter(HTMLParser):
    def __init__(self):
        super().__init__()
        self.n = 0
    def handle_starttag(self, tag, attrs):
        if tag == 'div': self.n += 1
    def handle_endtag(self, tag):
        if tag == 'div': self.n -= 1

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bad = 0
for f in sorted(glob.glob(os.path.join(ROOT, '*.html'))):
    p = DivCounter()
    p.feed(open(f, encoding='utf-8').read())
    if p.n != 0:
        bad += 1
        print(f'✗ اختلال div بـ{os.path.basename(f)}: {p.n:+d}')
print('✅ DIV: كل الصفحات متوازنة' if bad == 0 else f'⛔ DIV: {bad} ملف مختل')
sys.exit(1 if bad else 0)
