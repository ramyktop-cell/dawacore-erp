# REPAIR_REQUEST

Status: CHANGES_REQUESTED
Task ID: 20261102-customer-balance-print
Repair cycle: 1
Owner: Codex
Source review: REVIEW_REPORT.md / VIS-01

## VIS-01 / Medium — تأكيد معاينة إيصال القبض

- الملفات: tools/verify-customer-balance-print.cjs، وعند إثبات خلل القالب فقط frontend/src/services/printer.service.ts وfrontend/src/components/customers/CustomerPaymentModal.tsx.
- إعادة الإنتاج: من الجذر شغّل PRINT_VISUAL_CHECK=1 مع node tools/verify-customer-balance-print.cjs، وافتح evidence/payment.png.
- الفعلي: DOM يحتوي اسم العميل والأرصدة لكن الصورة بيضاء. المتوقع: مستند قبض واضح يتضمن السابق والمقبوض والمتبقي 0.00 دون أجزاء من الصفحة الأصلية.
- المطلوب الأدنى: تحديد سبب الالتقاط الأبيض بالأدلة، وإنتاج معاينة موثوقة أو فحص طباعة مباشر مع توثيق النتيجة. لا تغير منطق المديونية أو المعاملات لمعالجة هذا العيب.
- اختبارات الرجوع: إعادة اختبار السداد الكامل والجزئي وHTML escaping، وبناء الواجهة عند تعديل مصدرها، ومراجعة 58mm و80mm لفاتورة البيع. يحفظ جميع ما نجح في المهمة.
- حدّث IMPLEMENTATION_REPORT.md وأعد إلى Codex للمراجعة. لا تنشر حزمة للعميل قبل PASS.
