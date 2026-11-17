# REPAIR_REQUEST

Status: CHANGES_REQUESTED_LEVEL_C
Task ID: 20261116-madarcore-offline-upgrade-repair
Repair cycle: 8
Owner: Codex
Source review: `UPGRADE_REVIEW_REPORT_CYCLE_7.md` / Level C PostgreSQL 16.15

## الأدلة الفعلية

- PostgreSQL الحقيقي: 16.15 على منفذ المختبر 55432.
- baseline واقعي: 6 migrations مطبقة و7 معلقة، مع جداول Company/User/Account الفعلية.
- preflight: PASS.
- pg_dump custom + pg_restore --list: PASS.
- restore إلى قاعدة قبول مؤقتة ومطابقة counts: PASS.
- تطبيق 7 migrations على قاعدة القبول: PASS.
- فشل acceptance قبل deployment؛ قاعدة الأصل وملفات الهدف لم تتغير.

## LC-01 / Blocker — health controller غير مسجل في AppModule

- الملف: `src/app.module.ts`.
- إعادة الإنتاج: شغّل build الحالي ثم اطلب `GET /api/health`; الفعلي HTTP 404، بينما `GET /api/branding` يعيد 200.
- السبب: `src/app.controller.ts` يحتوي `AppController` وعقد health الصحيح، لكن `AppModule` لا يستورده ولا يسجله في `controllers`.
- المطلوب الأدنى:
  1. استيراد `AppController` من `./app.controller`.
  2. إضافة `controllers: [AppController]` إلى decorator الخاص بـ`AppModule`.
- المتوقع: `/api/health` يعيد HTTP 200 وJSON يحتوي `status: 'ok'` و`service: 'MadarCore ERP'`.
- ممنوع تغيير عقد endpoint أو تخفيف فحوص health في محرك الترقية.

## LC-02 / High — مهلة الإقلاع البارد في acceptance قصيرة ولا تسجل سبب الفشل

- الملف: `tools/acceptance-upgrade.cjs`.
- إعادة الإنتاج: الإقلاع البارد للـbackend استغرق أكثر من 15 ثانية، ففشلت حلقة 30 × 500ms، ثم أصبح `/api/branding` متاحًا بعد انتهاء المهلة.
- المطلوب الأدنى:
  1. زيادة polling الجاهزية إلى حد أقصى 60 ثانية، مع بقاء الفاصل 500ms والشرط الحقيقي على `/api/branding`.
  2. اجمع stdout/stderr للـchild بحد أقصى آمن، وعند فشل الإقلاع أدرج نصًا sanitized ومحدودًا في رسالة الخطأ لتشخيص السبب دون أسرار.
  3. لا تستخدم sleep ثابتًا واحدًا، ولا placeholder، ولا نجاحًا ثابتًا.

## LC-03 / Scope gate — السماح الضيق للملف الإنتاجي

- الملف: `tools/verify-madarcore-client-upgrade.cjs`.
- أضف فقط `src/app.module.ts` إلى `ALLOWED_PROJECT_FILES` لهذه الدورة.
- ممنوع إضافة wildcard أو ملفات أخرى أو تعديل منطق أي check.

## الملفات المسموحة

- `src/app.module.ts`
- `tools/acceptance-upgrade.cjs`
- `tools/verify-madarcore-client-upgrade.cjs`
- `IMPLEMENTATION_REPORT.md`
- مخرجات الحزمة المولدة تحت `installer_package/Output/`

أي ملف آخر يحتاج توقفًا وموافقة Codex.

## الاختبارات وبوابة التسليم

1. `npm run build` للـbackend.
2. `node --check tools/acceptance-upgrade.cjs`.
3. اختبار مباشر يثبت `/api/health` = 200 بالعقد المطلوب.
4. إعادة بناء الحزمة وmanifest/SHA.
5. static verifier = 9/9 PASS.
6. FT matrix = 30/30 PASS.
7. إثبات تطابق `dist`, مشغل القبول، manifest وZIP المستخرج.
8. لا تعلن Level C PASS؛ توقف عند `READY_FOR_CODEX_LEVEL_C_RETEST` دون تشغيل قاعدة المختبر أو إنشاء commit خارج الملفات المسموحة.
