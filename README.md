# هم‌بازی (HamBazi) — فاز ۲

پلتفرم رزرو سالن ورزشی و پیدا کردن هم‌بازی (فوتسال و والیبال). این نسخه شامل **فاز ۱ و ۲** است: ورود OTP، کشف سالن، رزرو با هولد، سانس باز، پرداخت شبیه‌سازی‌شده، پنل مالک.
مستندات در `docs/` (تحویل فاز ۲: `docs/09-phase2-handoff.md`؛ **استقرار: `docs/08-deployment-github-vercel-neon.md`**).

## اجرای محلی
پیش‌نیاز: Node 22، PostgreSQL 15+ (با افزونهٔ `btree_gist`، همراه Postgres هست).

```bash
npm install
cp .env.example .env            # سپس مقادیر را تنظیم کنید
createdb hambazi                # یا هر دیتابیس دلخواه؛ DATABASE_URL را مطابق آن بگذارید
npm run db:migrate              # اعمال مهاجرت‌ها
npm run db:seed                 # فقط dev/demo: سالن‌ها و حساب‌های نمونهٔ سمنان
npm run dev                     # http://localhost:3000
```

ورود سریع (نمونه، کد روی صفحه نمایش داده می‌شود): `۰۹۰۰۰۰۰۰۰۰۱` بازیکن، `۰۹۰۰۰۰۰۰۰۰۲` مدیر سالن، `۰۹۰۰۰۰۰۰۰۰۳` ادمین.

## دستورها
| دستور | کار |
|---|---|
| `npm run dev` / `build` / `start` | توسعه / ساخت / اجرای production |
| `npm test` | تست‌های Vitest (دیتابیس `hambazi_test` لازم است: `DATABASE_URL_TEST`) |
| `npm run typecheck` / `lint` | بررسی نوع و lint (شامل قانون ممنوعیت left/right در RTL) |
| `node tests/e2e/phase1.mjs` | تست سرتاسری با مرورگر (سرور باید روی `BASE` اجرا باشد؛ `playwright` باید نصب باشد) |

## محیط‌ها (`APP_ENV`)
`development | demo | production` — مقدار نامعتبر یا خالی = production. production با `SMS_PROVIDER=mock`، `PAYMENT_MODE=simulated` یا رمزهای نمونه **بالا نمی‌آید**.
