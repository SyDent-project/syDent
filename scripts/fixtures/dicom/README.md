# عيّناتُ DICOM للاختبار (v637)

ملفاتٌ صغيرة من بيانات اختبار **pydicom 3.0.2** (`pydicom/data/test_files/` — رخصة MIT، النصّ في `PYDICOM-LICENSE.txt`).
يستعملها `scripts/prove-xray-compare-dicom.js` لإثبات قارئ DICOM بعارض الأشعة على ملفاتٍ حقيقية لا مصطنعة:
`MR_small` بثلاثة ترميزات (صريح · ضمني · كبير الطرف) يجب أن تعطي الصورةَ نفسها بايتاً ببايت · `CT_small` 16 بت بإشارة
وتباعد بكسل · `SC_rgb_jpeg_dcmtk` JPEG Baseline · `JPEG2000` و`MR_small_RLE` ضغطٌ غير مدعوم يُعلَن باسمه ·
`rtplan` بلا صورة · `MR_truncated` ناقص. ليست بيانات مرضى.
