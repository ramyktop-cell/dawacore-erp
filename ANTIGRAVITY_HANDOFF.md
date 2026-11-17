# ANTIGRAVITY_HANDOFF

```text
المهمة 20261116-madarcore-offline-upgrade-repair، دورة الإصلاح 11، حالتها CHANGES_REQUESTED_LEVEL_C_PACKAGE_CLOSURE.

اقرأ AGENTS.md وREVIEW_REPORT.md وREPAIR_REQUEST.md بالكامل. أصلح LC-09 فقط.

السبب المثبت: الحزمة المستخرجة خارج E:\DawaCore لا تحتوي bcryptjs، بينما الاختبارات السابقة وجدتها بالخطأ من E:\DawaCore\node_modules. لذلك فشل acceptance الحقيقي بعد نجاح preflight وbackup وrestore و7 migrations المؤقتة، وقبل deployment.

عدّل فقط build-madarcore-client-upgrade.ps1 وverify-madarcore-client-upgrade.cjs وtest-madarcore-client-upgrade.ps1 والتقرير والمخرجات المولدة. ضع bcryptjs فقط داخل payload/tools/node_modules/bcryptjs، وأضف فحصًا واختبارًا من ZIP مستخرج في مسار مستقل يثبت أن module.createRequire المثبت عند acceptance-upgrade.cjs يحل المكتبة من داخل الحزمة ويشغل hash/compare smoke test.

ممنوع تعديل src/** أو frontend/src/** أو prisma/** أو tools/acceptance-upgrade.cjs أو apply/rollback أو منطق الأعمال والصلاحيات.

أعد البناء، static verifier، FT matrix، manifest وZIP SHA. وثق المسار الفعلي الذي حُلّت منه bcryptjs والبصمات. ضع الحالة READY_FOR_CODEX_LEVEL_C_RETEST_PACKAGE_CLOSURE وتوقف دون تشغيل PostgreSQL الحقيقي أو إعلان Level C PASS أو إرسال الحزمة للعميل.
```
