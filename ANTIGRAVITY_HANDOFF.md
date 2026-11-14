# رسائل التسليم

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
