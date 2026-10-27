# ۰۲ — معماری، پشتهٔ فنی، امنیت و استقرار

## ۱. انتخاب پشتهٔ فنی (و دلیل)

| لایه | انتخاب | دلیل کوتاه |
|---|---|---|
| فریم‌ورک | **Next.js (App Router) + TypeScript** | یک پروژه برای UI و API؛ SSR برای SEO صفحات عمومی؛ مناسب Vercel ولی روی Node معمولی هم اجرا می‌شود (بدون قفل‌شدن) |
| دیتابیس | **PostgreSQL** (Neon یا Supabase، با pooler) | تراکنش، قفل ردیف، `EXCLUDE`/unique جزئی برای جلوگیری از رزرو دوبل؛ مهاجرت آسان به هر هاست دیگر |
| ORM/مهاجرت | **Drizzle ORM + drizzle-kit** | SQL شفاف، سبک برای serverless، کنترل کامل constraintها |
| اعتبارسنجی | **Zod** | یک schema برای فرم و سرور |
| احراز هویت | **سفارشی: OTP + نشست دیتابیسی** | بدون وابستگی؛ کنترل کامل روی rate-limit و امنیت؛ توکن نشست تصادفی، فقط هش در DB، کوکی `HttpOnly; Secure; SameSite=Lax` |
| Rate limit | جدول DB (پنجرهٔ ثابت) در P1؛ در صورت نیاز Upstash Redis | بدون سرویس اضافه در MVP |
| ذخیرهٔ فایل | لایهٔ `StorageProvider`؛ پیاده‌سازی اولیه: **S3-سازگار** (Cloudflare R2 / ArvanCloud S3) یا Vercel Blob | آپلود هرگز روی دیسک محلی؛ ArvanCloud برای دسترسی بهتر از ایران قابل جایگزینی است |
| SMS | `SmsProvider` (mock الان؛ بعداً Kavenegar/Melipayamak/…) | بدون تغییر منطق احراز هویت |
| پرداخت | `PaymentProvider` (disabled / simulated / sandbox / live) | بخش ۴ |
| UI | Tailwind CSS + Radix primitives، فونت Vazirmatn | بخش سیستم طراحی |
| تاریخ | `Intl` با `fa-IR-u-ca-persian` + `date-fns-jalali`؛ منطقهٔ `Asia/Tehran` با `@date-fns/tz` | بدون offset سخت‌کد |
| تست | **Vitest** (واحد/یکپارچه روی Postgres واقعی داکر)، **Playwright** (E2E، RTL، ریسپانسیو) | تست همزمانی نیاز به Postgres واقعی دارد |
| Lint | ESLint + Prettier + قانون ممنوعیت `left/right` | |

نکتهٔ قفل‌شدن: منطق کسب‌وکار در `src/server/**` است و به APIهای Vercel وابسته نیست؛ فقط `vercel.json` (cron) و تنظیمات استقرار Vercel-محور است.

## ۲. ساختار ماژول‌ها

```
src/
  app/                 # صفحات و route handler (لایهٔ نازک)
  server/
    env.ts             # اعتبارسنجی APP_ENV و فلگ‌ها؛ ناامن ⇒ fail
    settings/          # سرویس تنظیمات (کارمزد، هولد، ددلاین)
    auth/              # otp, sessions, rbac
    venues/ slots/ reservations/ sessions/ payments/ ratings/ reliability/ notifications/
    providers/{sms,payment,storage}/
    jobs/              # sweeper idempotent
    audit/
  lib/i18n/            # format.ts (ارقام فارسی), jalali.ts, phone.ts
  db/                  # schema, migrations, seed (فقط dev/demo)
  messaging/           # ایزوله (فاز ۶)
```

قانون: **هر قاعدهٔ کسب‌وکار فقط در `src/server/<domain>` زندگی می‌کند**؛ route handlerها فقط اعتبارسنجی ورودی، احراز هویت/مجوز و فراخوانی سرویس.

## ۳. مدل محیط (`APP_ENV`)
مقادیر: `development | demo | production`. در راه‌اندازی اعتبارسنجی می‌شود؛ مقدار نامعتبر/غایب ⇒ `production`.

| قابلیت | development | demo | production |
|---|---|---|---|
| Mock SMS با نمایش کد | ✔ | ✔ | ✘ (برنامه بالا نمی‌آید اگر فعال باشد) |
| پرداخت شبیه‌سازی‌شده | ✔ | ✔ | ✘ (برنامه بالا نمی‌آید) |
| seed و حساب‌های دمو | ✔ | ✔ | ✘ |
| بنر «محیط دمو» | – | ✔ | ✘ |
| ارائه‌دهندهٔ SMS واقعی | اختیاری | اختیاری | **اجباری**؛ نبودنش ⇒ خطای واضح (نه شبیه‌سازی بی‌صدا) |

## ۴. جریان‌های A تا I (مسئول قانون + جلوگیری از به‌روزرسانی غیرمجاز)

**A. احراز هویت** — `auth/otp`: نرمال‌سازی شماره (ارقام فارسی/عربی، `0`/`+98`، فرمت canonical `+98 9xx…`) ← rate-limit (شماره + IP، کولداون ارسال مجدد) ← تولید OTP با `crypto.randomInt` ← ذخیرهٔ **هش** (HMAC با secret سرور) + انقضا + شمارندهٔ تلاش ← `SmsProvider.send` (mock کد را برای نمایش برمی‌گرداند، فقط dev/demo) ← تأیید: در یک تراکنش `UPDATE … WHERE used_at IS NULL AND expires_at > now() AND attempts < max RETURNING` ← نشست جدید (چرخش توکن) ← redirect فقط به مسیرهای داخلی allowlist. هرگز وجود حساب فاش نمی‌شود (پاسخ یکسان). کد قبلی با درخواست جدید باطل می‌شود.

**B. کشف سالن** — query معتبر (Zod) ← کوئری پارامتری DB با فیلتر/صفحه‌بندی ← فرمت‌دهی فقط در لایهٔ نمایش. فقط سالن‌های `published`.

**C. رزرو** — `reservations.create` در یک تراکنش: قفل ردیف اسلات (`SELECT … FOR UPDATE`) ← اگر هولد قبلی منقضی است همان‌جا `expired` شود ← اگر `open` نیست رد ← درج claim با unique جزئی ← رزرو `awaiting_payment` با `hold_expires_at = now()+hold` ← پرداخت ← تأیید. انقضا **هنگام هر خواندن/نوشتن** ارزیابی می‌شود؛ cron فقط جاروب پشتیبان است.

**D. پیوستن به سانس باز** — تراکنش: قفل ردیف سانس ← بررسی eligibility (سطح مهارت، ددلاین، وضعیت، عدم عضویت قبلی — unique `(session_id,user_id)`)، `filled < target` ← درج شرکت‌کننده `pending_payment` (صندلی با هولد) ← پرداخت ← `confirmed`؛ شمارش `filled` با `count()` همان تراکنش، نه فیلد کلاینت.

**E. پرداخت** — سرور مبلغ+کارمزد را از snapshot سیاست محاسبه می‌کند؛ `PaymentProvider.createIntent` ← (simulated: دکمهٔ شبیه‌ساز) ← تغییر وضعیت فقط از مسیر سرور/کال‌بک تأییدشده؛ کلید idempotency یکتا؛ هر گذار در `payment_events` (append-only) ثبت می‌شود؛ بازگشت کاربر از صفحهٔ پرداخت چیزی را تأیید نمی‌کند.

**F. امتیازدهی** — فقط شرکت‌کنندگان `attended` سانس `completed`؛ unique `(session_id, rater_id, target_id)`؛ خودامتیازی ممنوع؛ تجمیع در سرور (بخش `04-state-machines`/قواعد)؛ کلاینت هرگز نمرهٔ نهایی نمی‌فرستد.

**G. مدیریت سالن** — middleware مجوز: `venue_managers(user_id, venue_id)`؛ هر query با شرط مالکیت؛ تغییر در تراکنش + `audit_log`.

**H. لغو/انقضا** — سرویس idempotent با کلید طبیعی (`status` فعلی + `version`)؛ دو بار اجرا ⇒ بدون اثر؛ ریفاند فقط رکورد (simulated) با unique `(payment_id, reason)` ضد تکرار.

**I. پیام‌رسانی (فاز ۶)** — فقط عضو اتاق؛ متن escape‌شده؛ rate-limit و حداکثر طول؛ ماژول ایزوله.

## ۵. مدل امنیتی (چک‌لیست)
- RBAC: نقش‌ها `player | venue_manager | admin`؛ «میزبان» نقش نیست، رابطه است. کنترل در سرور در **هر** عملیات؛ جلوگیری از IDOR با شرط مالکیت در کوئری.
- CSRF: کوکی `SameSite=Lax` + بررسی `Origin` برای متدهای غیر امن + توکن برای Server Actions/فرم‌ها.
- CSP سخت، `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors 'none'`، HSTS.
- XSS: خروجی escape؛ محتوای کاربر (نظرات/توضیحات) متن ساده.
- آپلود: allowlist نوع (jpeg/png/webp) با بررسی magic bytes، حداکثر حجم، تغییر اندازه سمت سرور، نام تصادفی.
- لاگ: بدون OTP، تلفن کامل و توکن؛ تلفن ماسک‌شده.
- اسرار فقط در env؛ `.env.example` فقط placeholder؛ `gitleaks` در CI.
- مجموعهٔ تست امنیتی طبق بخش ۱۶ بریف (OTP منقضی/استفادهٔ مجدد، rate limit، رزرو همزمان، join تکراری، کال‌بک جعلی…).
- ریسک‌های باقی‌ماندهٔ صادقانه در پایان هر فاز گزارش می‌شود؛ ادعای «کاملاً امن» نمی‌شود.

## ۶. پرداخت: چهار حالت
`disabled` (پیش‌فرض production؛ مبلغ نمایش داده می‌شود، پرداخت ممکن نیست) · `simulated` (فقط dev/demo، فلگ `simulated=true` غیرقابل تبدیل، نوار «پرداخت شبیه‌سازی‌شده — پولی کسر نمی‌شود») · `sandbox` (محیط تست درگاه واقعی، پس از انتخاب) · `live` (فقط با فعال‌سازی صریح شما). مبالغ **Int تومان**؛ تبدیل به ریال فقط در مرز adapter. کارمزد: درصد قابل‌تنظیم + حداقل ثابت اختیاری، پیش‌فرض روی بازیکن (بالای قیمت سالن)، قاعدهٔ گرد کردن: `ceil` به نزدیک‌ترین ۱۰ تومان؛ snapshot سیاست روی هر پرداخت.

## ۷. استقرار روی Vercel و زمان‌بندی
- **Cron در Hobby:** مطابق مستندات رسمی Vercel، در پلن Hobby حداکثر **روزی یک‌بار**، با دقت زمانی تضمین‌نشده (کار ساعت ۱ ممکن است بین ۱:۰۰ تا ۱:۵۹ اجرا شود) و ۲ job در هر حساب؛ Pro تا ۴۰ job. ([مستندات](https://docs.vercel.com/docs/cron-jobs/usage-and-pricing))
- بنابراین **درستی کسب‌وکار به cron وابسته نیست**: انقضای هولد و ددلاین سانس هنگام خواندن/نوشتن (lazy، تراکنشی) ارزیابی می‌شود؛ cron روزانه فقط پاک‌سازی و ارسال اعلان‌های عقب‌افتاده است. گزینه‌های ریزتر: پلن Pro، یا زمان‌بند خارجی (مثلاً cron-job.org / GitHub Actions) که یک endpoint امن (`Authorization: Bearer CRON_SECRET`) را صدا می‌زند.
- **ملاحظهٔ پلن:** Hobby طبق شرایط Vercel برای استفادهٔ غیرتجاری است؛ برای محصول تجاری واقعی باید Pro (یا هاست دیگر) در نظر گرفته شود — پیش از لانچ تأیید می‌کنم.
- **دسترسی از ایران:** یک گزارش جامعه در انجمن Vercel دربارهٔ باز نشدن سایت‌های Vercel از ایران هست ولی پاسخ رسمی ندارد و علت (محدودیت سمت هاست یا فیلترینگ داخلی) نامشخص است. [منبع](https://community.vercel.com/t/website-not-accessible-need-clarification-on-ip-restrictions/12398). من نتیجه را ادعا نمی‌کنم؛ **شما** باید با صفحهٔ آزمایشی (`iran-reachability-test/`) تست کنید و نتیجه را بگویید. اگر باز نشد، گزینه‌های جایگزین: VPS ایرانی/ArvanCloud با Docker + Postgres، یا Liara/Hamravesh (PaaS ایرانی). کد طوری نوشته می‌شود که با `next start` روی Node معمولی اجرا شود.
- دیتابیس: Neon/Supabase با connection pooling (PgBouncer)، منطقهٔ نزدیک به منطقهٔ توابع. پشتیبان‌گیری: PITR/روزانه (بسته به پلن) + `pg_dump` زمان‌بندی‌شده؛ مستند در فاز ۸.
- هزینه‌های تکرارشونده: فهرست کامل در سند استقرار هر فاز (Vercel، دیتابیس، ذخیره‌ساز، دامنه، SMS، درگاه).
- مهاجرت‌ها: `drizzle-kit migrate` در مرحلهٔ build/release، نه در زمان اجرای درخواست.
