# مرحله ۳: راه‌اندازی Auth0 (راهنمای گرافیکی)

**وضعیت:** کد Resource Server و تست‌ها آماده شده‌اند؛ اتصال واقعی حساب Auth0، OAuth ChatGPT و REA هنوز آزمایش نشده است.

## گام ۳.۱: فقط ساخت حساب/tenant

1. به https://auth0.com/ یا https://manage.auth0.com/ برو و یک حساب ایجاد کن یا وارد شو.
2. اگر Tenant نداری، Tenant جدید بساز؛ نام آزاد و غیرحساس انتخاب کن.
3. بعد از رسیدن به داشبورد Auth0، فقط بگو «گام ۳.۱ انجام شد». هیچ Client Secret، Password، Access Token یا Recovery Code در گفتگو نفرست.

## گام‌های بعدی (هنوز انجام نده)

- در **Applications → APIs** یک API با Identifier دقیقاً برابر با آدرس HTTPS نهایی REA Gateway بساز. دامنه نهایی هنوز نداریم، پس فعلاً API نساز.
- Permission با نام `rea:inspect` را تعریف کن و مجوزهای قابل اجرا را بر اساس بررسی ایمنی ابزارها محدود نگه دار.
- در **Tenant Settings → Advanced** حالت **Resource Parameter Compatibility Profile** را بررسی و در صورت نیاز فعال کن تا پارامتر `resource` ارسالی توسط ChatGPT به audience درست تبدیل شود.
- در **Applications** ثبت ChatGPT را طبق روش **Client ID Metadata Document (CIMD)** بررسی کن؛ Auth0 ممکن است به تأیید صریح مدیر و تنظیمات tenant نیاز داشته باشد. اگر CIMD حساب پشتیبانی نشد، روش DCR یا client از پیش ثبت‌شده را جداگانه ارزیابی می‌کنیم.
- بعد از دریافت URL واقعی Render و ساخت API، متغیرهای `REA_PUBLIC_URL`, `AUTH0_ISSUER`, `AUTH0_AUDIENCE` و `AUTH0_ALLOWED_SUBJECTS` را در **Render Environment** تنظیم خواهیم کرد؛ رمزها هیچ‌وقت به GitHub ارسال نمی‌شوند.
- `AUTH0_ALLOWED_SUBJECTS` باید زیرشناسه `sub` کاربر مجاز را شامل شود؛ ایمیل جای شناسه `sub` نیست.

## مرزبندی در این مرحله

- `/.well-known/oauth-protected-resource` با تنظیمات معتبر، نشانی Auth0 را به MCP Client معرفی می‌کند.
- OAuth Access Token باید از Auth0 صادر شده باشد و امضا با `jose` و کلیدهای رسمی JWKS بررسی شود.
- `iss`, `aud`, `exp`, `iat`, `sub`, scope و allowlist کاربر بررسی می‌شود؛ امضای نامعتبر به REA منتقل نمی‌شود.
- حتی اگر احراز هویت موفق شود، `/mcp` همچنان **503** برمی‌گرداند. این یک محافظ عمدی تا پایان مرحله اجرای ایزوله و احراز ابزار است.
- پروژه خودمان authorization server جدید نمی‌سازد. Auth0 جریان Authorization Code + PKCE و سرویس CIMD را مدیریت می‌کند. سازگاری واقعی باید انتها به انتها تست شود.
- تنظیمات OAuth ناتمام، اجرا را باز نمی‌کند (fail closed).

## منابع رسمی

- https://developers.openai.com/plugins/build/auth
- https://auth0.com/blog/auth0-auth-for-mcp-servers-generally-available/
- https://support.auth0.com/center/s/article/mcp-audience-error-with-auth0
