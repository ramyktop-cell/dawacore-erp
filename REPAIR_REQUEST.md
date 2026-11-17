# REPAIR_REQUEST

Status: CHANGES_REQUESTED_LEVEL_C_ROLLBACK_ENGINE
Task ID: 20261116-madarcore-offline-upgrade-repair
Repair cycle: 10
Owner: Codex
Source review: `UPGRADE_REVIEW_REPORT_CYCLE_7.md` / Level C PostgreSQL 16.15

## الأدلة الفعلية

### نتيجة إعادة الاختبار بعد Cycle 9

- acceptance الكامل نجح على PostgreSQL 16.15 الحقيقي، بما فيه HTTP-13 والمصروفات والمبيعات والمشتريات والإغلاق.
- production migrations وfile/runtime swap: PASS.
- post-deploy health: FAIL بسبب انتهاء مهلة الإقلاع البارد، ثم ثبت أن عملية target بدأت وأصبحت تستمع على 3107 بعد انتهاء الفحص.
- automatic rollback أعاد الملفات، لكنه فشل في استعادة DB لأن `pg_restore --clean` لم يستطع حذف الجداول القديمة التي تعتمد عليها جداول candidate-only الجديدة.
- rollback script خرج بفشل وكتب MANUAL_RECOVERY_REQUIRED، لكن apply لم يفحص exit code وغيّر التقرير خطأً إلى ROLLBACK_SUCCESS.
- عند runMode=None بقيت عملية candidate التي بدأها post-deploy تعمل لأن catch حاول إيقاف runMode القديم None بدل اكتشاف العملية الحالية.
- Codex استعاد قاعدة المختبر يدويًا بنجاح عبر: `DROP SCHEMA public CASCADE; CREATE SCHEMA public AUTHORIZATION CURRENT_USER;` ثم pg_restore بدون `--clean`. عادت القاعدة إلى 6 migrations واختفت جداول candidate-only.

## LC-05 / Blocker — post-deploy health timeout أقصر من الإقلاع البارد

- الملف: `installer_package/madarcore-client-upgrade/apply-madarcore-upgrade.ps1`.
- وسّع polling الصحي بعد النشر إلى مهلة كلية واضحة لا تقل عن 60 ثانية، مع فاصل محدود، مع بقاء عقد health وbranding صارمًا كما هو.
- لا تخفف العقد ولا تعتبر فتح المنفذ وحده نجاحًا.

## LC-06 / Critical — rollback DB غير exact بعد migrations جديدة

- الملف: `installer_package/madarcore-client-upgrade/rollback-madarcore-upgrade.ps1`.
- بعد كل تحقق أمان موجود حاليًا وبعد التحقق من dump hash، وقبل pg_restore:
  1. نفذ على قاعدة الهدف نفسها وبـON_ERROR_STOP: `DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public AUTHORIZATION CURRENT_USER;`.
  2. إذا فشل reset، توقف MANUAL_RECOVERY_REQUIRED ولا تشغّل pg_restore.
  3. شغّل pg_restore على schema النظيفة مع `--exit-on-error` وبدون `--clean/--if-exists`.
  4. أبقِ مطابقة table counts والتحققات اللاحقة.
- ممنوع إسقاط database أو أي قاعدة أخرى؛ العملية مقصورة على schema `public` داخل database المثبتة في التقرير بعد تحقق canonical target/report/dump.

## LC-07 / Critical — apply يعلن rollback ناجحًا رغم فشل أداة rollback

- الملف: `installer_package/madarcore-client-upgrade/apply-madarcore-upgrade.ps1`.
- بعد استدعاء `rollback-madarcore-upgrade.ps1` افحص exit code صراحة.
- لا تضبط `ROLLBACK_SUCCESS` إلا إذا كان exit code = 0.
- عند أي فشل اضبط `MANUAL_RECOVERY_REQUIRED` واحفظ التقرير واخرج بكود غير صفري دون طباعة نجاح مضلل.

## LC-08 / High — العملية المرشحة تبقى حية عندما كان runMode=None

- الملف: `installer_package/madarcore-client-upgrade/apply-madarcore-upgrade.ps1`.
- في مسار deployment failure، أوقف العملية الحالية التابعة للمسار/المنفذ الهدف باستخدام الاكتشاف الحالي (`Terminate-TargetProcessOnly` أو ما يعادله الآمن)، لا باستخدام runMode القديم None فقط.
- يجب رفض قتل ForeignProcess والحفاظ على حواجز الهوية والمسار.

## نطاق Cycle 10

- مسموح: `installer_package/madarcore-client-upgrade/apply-madarcore-upgrade.ps1`, `installer_package/madarcore-client-upgrade/rollback-madarcore-upgrade.ps1`, `tools/test-madarcore-client-upgrade.ps1`, `IMPLEMENTATION_REPORT.md`, ومخرجات الحزمة.
- ممنوع: `src/**`, `prisma/**`, acceptance business scenarios، والصلاحيات.
- أضف/وسّع regression coverage لإثبات LC-05..LC-08، ثم static verifier وFT matrix وبناء الحزمة وتطابق ZIP.
- توقف عند `READY_FOR_CODEX_LEVEL_C_RETEST_ROLLBACK` دون تشغيل PostgreSQL الحقيقي أو إعلان PASS.

### نتيجة إعادة الاختبار بعد Cycle 8

- LC-01 نجح: `/api/health` أعاد العقد الصحيح.
- LC-02 نجح: backend اجتاز الإقلاع البارد والـpolling الجديد.
- HTTP-01..HTTP-12 وDB-09B..DB-12D نجحت على PostgreSQL 16.15 الحقيقي.
- الفشل الجديد الوحيد: HTTP-13 عند إنشاء مصروف نقدي.
- السبب المثبت من الكود: الوردية `shiftId` مملوكة للكاشير، بينما الطلب يستخدم `adminTokenA`. خدمة المصروفات تشترط `shift.userId === user.id`. استخدام cashier غير صحيح أيضًا لأنه لا يملك `expenses:write`.
- قاعدة الأصل بقيت عند 6 migrations، وdeployment لم يبدأ.

## LC-04 / Blocker — سيناريو المصروف يستخدم وردية مستخدم آخر

- الملف: `tools/acceptance-upgrade.cjs` فقط.
- المطلوب الأدنى:
  1. قبل سيناريو المصروف، افتح وردية مستقلة للمدير `adminUserA` عبر `POST /api/shifts/open` باستخدام `adminTokenA` و`branchA1.id` و`userId: adminUserA.id` ورصيد افتتاحي واضح مثل 100.
  2. تحقق من HTTP 201 ووجود id، واحفظه في متغير منفصل مثل `expenseShiftId`.
  3. استخدم `expenseShiftId` في طلب المصروف المقبول HTTP-13، واستعلام CashMovement DB-13D، وطلب المصروف المفرط HTTP-13F.
  4. أبقِ `adminTokenA` لأن دور CASHIER لا يملك `expenses:write`.
  5. حدّث التعليقات الحسابية لتطابق رصيد وردية المدير: 100 قبل المصروف و70 بعد مصروف 30.
  6. لا تغيّر خدمة المصروفات أو الصلاحيات أو قواعد ملكية الوردية.

## نطاق Cycle 9

- مسموح: `tools/acceptance-upgrade.cjs`, `IMPLEMENTATION_REPORT.md`, ومخرجات الحزمة المولدة.
- ممنوع: `src/**`, `prisma/**`, سياسة الصلاحيات، خدمات المصروفات، ومحرك الترقية.
- بعد البناء: static 9/9 وFT 30/30 وتطابق المصدر/manifest/ZIP.
- توقف عند `READY_FOR_CODEX_LEVEL_C_RETEST_HTTP13` دون تشغيل PostgreSQL أو إعلان Level C PASS.

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

## الملفات المسموحة في Cycle 8 المنجز

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
