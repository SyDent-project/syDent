"""خطٌّ هرميّ لمثبتات DOM (v492).

المشكلة: theme.css يستورد Noto Kufi Arabic من fonts.googleapis.com. بيئةٌ بلا وصولٍ
للشبكة (حاوية · CI محجوب · جهاز الطبيب دون إنترنت) تسقط على خطٍّ بديل أعرض فتُقصّ
التسميات وتفشل قياسات الأزرار والشرائط بـ«10 فشل» وهمية لا علاقة لها بالكود.

الحل: اعتراض الطلبين على مستوى المتصفح (Playwright route) — ورقة Google تُستبدل بورقةٍ
محلية، وملفات fonts.gstatic.com تُلبّى من النسخة المرفقة (OFL · @fontsource 5.3.0 ·
8 أوجه: عربي+لاتيني × 400/500/600/700 — نفس ملفات الإنتاج بـ/fonts). القياسُ صار حتمياً بنفس الخط الذي يراه
المستخدم. الإنتاج لا يُمسّ: الصفحات ما زالت تطلب Google كما كانت.

الاستعمال: من كل مثبت، بعد إنشاء الصفحة/السياق:
    from _fonts.hermetic import hermetic_fonts
    hermetic_fonts(page)          # أو hermetic_fonts(context) لكل الصفحات
"""
import os

_HERE = os.path.dirname(os.path.abspath(__file__))
# v493: مصدرٌ واحد — نسخةُ الإنتاج بـ/fonts (لا نسخة ثانية للاختبار)
_ROOT = os.path.abspath(os.path.join(_HERE, '..', '..', '..'))
_CSS = os.path.join(_ROOT, 'fonts', 'noto-kufi-arabic.css')
_FILES = os.path.join(_ROOT, 'fonts')


def _serve_css(route, request):
    css = open(_CSS, encoding='utf-8').read()   # url(/fonts/…) — يلتقطها مسار **/fonts/ أدناه أياً كان الأصل
    route.fulfill(status=200, content_type='text/css; charset=utf-8', body=css,
                  headers={'access-control-allow-origin': '*'})


def _serve_font(route, request):
    name = request.url.rsplit('/', 1)[-1].split('?')[0]
    path = os.path.join(_FILES, name)
    if name.startswith('noto-kufi-arabic-') and name.endswith('.woff2') and os.path.isfile(path):
        route.fulfill(status=200, path=path, content_type='font/woff2',
                      headers={'access-control-allow-origin': '*'})
    else:
        # أي خطٍّ آخر من Google (Cairo بصفحات الحجز مثلاً) ⇒ 404 صريح: سقوطٌ حتميّ
        # للبديل بدل انتظار الشبكة ثم السقوط عشوائياً.
        route.fulfill(status=404, body='')


def hermetic_fonts(target):
    """target: Page أو BrowserContext من Playwright."""
    target.route('**/fonts.googleapis.com/**', _serve_css)
    target.route('**/fonts.gstatic.com/**', _serve_font)
    # v493: الإنتاج صار يخدم الخط من /fonts/ (theme.css)؛ صفحات المثبتات تُفتح بـfile:// فيتحوّل
    # المسارُ المطلق إلى جذر نظام الملفات — تُلبّى من النسخة نفسها (الملفات مطابقة بايت-بايت).
    target.route('**/fonts/noto-kufi-arabic-*.woff2', _serve_font)
    target.route('**/fonts/noto-kufi-arabic.css', _serve_css)
    return target
