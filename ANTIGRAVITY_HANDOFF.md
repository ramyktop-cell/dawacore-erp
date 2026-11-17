# رسائل التسليم

## التسليم النشط — Level C Repair Cycle 8

```text
المهمة 20261116-madarcore-offline-upgrade-repair، دورة الإصلاح 8، حالتها CHANGES_REQUESTED_LEVEL_C.
اقرأ AGENTS.md وREPAIR_REQUEST.md وUPGRADE_REVIEW_REPORT_CYCLE_7.md.
نفذ LC-01 وLC-02 وLC-03 فقط ضمن الملفات المسموحة.
لا تغيّر schema أو migrations أو منطق الأعمال أو عقود health/branding.
أعد build والحزمة، وشغّل static verifier وFT matrix، وحدّث IMPLEMENTATION_REPORT.md.
توقف عند READY_FOR_CODEX_LEVEL_C_RETEST؛ لا تشغّل مختبر PostgreSQL ولا تعلن Level C PASS ولا ترسل ZIP للعميل.
```

تُملأ معرفات المهمة والمراجعة قبل استخدام أي رسالة. اقرأ AI_DEVELOPMENT_WORKFLOW.md وAGENTS.md أولاً.

## من Codex إلى Antigravity — تنفيذ

```text
نفذ المهمة <TASK_ID> وفق IMPLEMENTATION_PLAN.md، المراجعة <REVISION>، وحالتها PLAN_READY.
اقرأ AGENTS.md والخطة والملفات المرتبطة. احفظ baseline قبل التعديل.
عدّل الملفات المذكورة في Allowed files فقط. احفظ أي تعديلات سابقة للمستخدم.
نفذ معايير القبول والاختبارات المحددة، ووثق الأوامر والنتائج والأدلة والفروق في IMPLEMENTATION_REPORT.md.
إذا ظهر احتياج خارج الحدود، وثقه وأعده إلى Codex قبل توسيع العمل.
عند الانتهاء ضع READY_FOR_REVIEW وتوقف عن التعديل. لا تصدر PASS أو تنشر خارج تفويض الخطة.
```

## من Antigravity إلى Codex — مراجعة

```text
المهمة <TASK_ID> جاهزة للمراجعة، وفق الخطة <REVISION>.
IMPLEMENTATION_REPORT.md يتضمن الملفات والفروق والاختبارات والقيود.
النسخة النهائية/البصمات: <LOCATION>، والنسخة المرجعية: <LOCATION>.
توقف التنفيذ. راجع الفروق الفعلية ومعايير القبول، واكتب REVIEW_REPORT.md.
```

## من Codex إلى Antigravity — إصلاح فقط

```text
راجع REPAIR_REQUEST.md للمهمة <TASK_ID>، دورة <CYCLE>، وحالتها CHANGES_REQUESTED.
أصلح العيوب <ISSUE_IDS> فقط ضمن الملفات المسموحة في الطلب.
احتفظ ببقية الوظائف والتعديلات. نفذ اختبارات الإصلاح والرجوع وحدّث IMPLEMENTATION_REPORT.md.
عند الانتهاء ضع READY_FOR_REVIEW وتوقف عن التعديل ليعيد Codex المراجعة.
```
