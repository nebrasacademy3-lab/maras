# Tap webhook security notes

بحسب توثيق Tap الرسمي في صفحة Webhook، يجب حساب قيمة HMAC-SHA256 من السلسلة:
`x_id{id}x_amount{amount}x_currency{currency}x_gateway_reference{gateway_reference}x_payment_reference{payment_reference}x_status{status}x_created{created}`
باستخدام `TAP_SECRET_KEY`، ثم مقارنة الناتج بقيمة `hashstring` المرسلة في ترويسة الطلب. يجب تنسيق amount وفق الدقة القياسية للعملة، وتمرير gateway_reference فارغًا إذا لم يكن متاحًا. لا تتم معالجة حالة الدفع قبل نجاح المقارنة، مع الإبقاء على التحقق من Tap API وidempotency.

المصدر: https://developers.tap.company/docs/webhook
