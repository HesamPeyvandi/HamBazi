# تحویل فاز ۱۲ — تصاویر AVIF/WebP، حذف درخواست‌های تکراری و debounce جستجو (گام ۲ بهینه‌سازی)

## خلاصه
۱. **تبدیل تصاویر به AVIF/WebP** (با چند اندازهٔ ریسپانسیو)، حذف JPEGهای سنگین و کش طولانی‌مدت.
۲. **جلوگیری از درخواست‌های تکراری**: سمت کلاینت (چت، `singleFlight`) و سمت سرور (`currentUser`، شهرها و ورزش‌ها فقط یک بار در هر درخواست).
۳. **debounce جستجو**: سانس‌ها، تیم‌ها و کاربران ادمین هنگام تایپ، ۴۰۰ms بعد از آخرین کلید یک درخواست می‌فرستند.

## ۱) تصاویر
- `scripts/optimize-images.mjs` (دستور `npm run images:optimize`): هر `.jpg/.png` داخل `public/img` را به `name-<عرض>.avif` و `.webp` تبدیل می‌کند (عرض‌ها: ۴۸۰، ۸۰۰، ۱۲۸۰ و عرض اصلی)؛ آواتارها `p1-96.webp` و `p1-192.webp`. فایل `src/lib/image-manifest.json` را می‌نویسد.
- **سازگاری بدون migration**: دیتابیس و seed همچنان کلیدهای قدیمی (`img/hall-a.jpg`، `/img/avatars/p3.jpg`) را نگه می‌دارند. `src/lib/images.ts` و کامپوننت `src/components/ui/Picture.tsx` آن‌ها را به فایل‌های تازه نگاشت می‌کنند. عکس‌های آپلودی (Blob/محلی) از قبل WebP هستند و عیناً نمایش داده می‌شوند.
- `<Picture>`: `<picture>` با منبع AVIF، سپس WebP و `<img>` پشتیبان WebP؛ `sizes` برای انتخاب فایل مناسب؛ `priority` (eager + `fetchpriority=high`) برای تصویر LCP (هیرو، تصویر اول گالری)؛ بقیه lazy؛ هنر‌کارگردانی (`art`) برای هیرو عریض دسکتاپ (`min-width:1024px`).
- جایگزین شد در: صفحهٔ اصلی، هیروی سالن‌ها، پس‌زمینهٔ ورود/ثبت‌نام، `VenueCard` (دو حالت)، `Gallery` (تصویر اصلی و بندانگشتی‌ها)، صفحهٔ تصاویر سالن در پنل مالک، `Avatar`.
- JPEGهای اصلی **حذف شدند** (مجموع ۱٫۷ MB). برای افزودن عکس جدید: JPG را در `public/img` بگذارید ← `npm run images:optimize -- --remove` ← فایل‌های تولیدشده و manifest را commit کنید (جزئیات در `docs/ASSETS.md`).
- `next.config.mjs`: برای `/img/*` و `/fonts/*` هدر `Cache-Control: public, max-age=2592000, stale-while-revalidate=86400` (پیش‌فرض Next برای فایل‌های public صفر است).
- نمونه حجم‌ها: `hall-a` موبایل (۸۰۰px) از ۲۲۳ KB JPEG به ۲۳ KB AVIF؛ هیرو دسکتاپ ۱۷۰ KB ← ۴۰ KB (۱۲۸۰px).

## ۲) درخواست‌های تکراری
- **چت** (`ChatRoom.tsx`): پولینگ قبلاً با رویداد `visibilitychange` می‌توانست هم‌زمان با تایمر دو زنجیره بسازد. اکنون فقط یک poll در حال اجراست (`running`)، با `AbortController` هنگام خروج؛ دکمهٔ «پیام‌های قدیمی‌تر» با `singleFlight` (دوبار‌کلیک = یک درخواست).
- `src/lib/client/single-flight.ts`: ابزار عمومی؛ تا وقتی درخواستی با همان کلید در جریان است، همه‌ی فراخوانی‌ها همان promise را می‌گیرند.
- **سرور**: `currentUser`، `getCities` و `getSportsList` با `React.cache` در هر درخواست یک‌بار به دیتابیس می‌روند (قبلاً layout، header و صفحه هر کدام جداگانه می‌پرسیدند).
- دکمه‌های فرم از فاز ۱۱ قفل دارند؛ سرور هم idempotent است.

## ۳) debounce جستجو
- `src/lib/client/debounce.ts` (`useDebouncedCallback`) و `src/components/forms/LiveSearchInput.tsx`.
- رفتار: ۴۰۰ms بعد از آخرین کلید، فقط اگر عبارت (trim‌شده) تغییر کرده و خالی یا حداقل ۲ نویسه باشد، URL با `router.replace` به‌روز می‌شود (بدون reload، بدون scroll، `page` ریست می‌شود، بقیهٔ پارامترها حفظ). اسپینر کوچک هنگام بارگذاری. Enter/دکمهٔ فرم بدون JS هم کار می‌کند.
- در: `/sessions` (نام سالن)، `/teams` (نام تیم)، `/admin/users` (نام یا شماره).

## فایل‌های جدید/تغییریافته
- جدید: `scripts/optimize-images.mjs`، `src/lib/images.ts`، `src/lib/image-manifest.json`، `src/components/ui/Picture.tsx`، `src/lib/client/{single-flight,debounce}.ts`، `src/components/forms/LiveSearchInput.tsx`، `tests/phase12.test.ts`، `tests/e2e/phase12.mjs`، ~۶۰ فایل `public/img/*.avif|webp`.
- تغییر: `src/app/{page,venues/page,sessions/page,teams/page,admin/users/page,owner/venues/[id]/page}.tsx`، `AuthShell`، `VenueCard`، `Gallery`، `misc.tsx` (Avatar)، `ChatRoom.tsx`، `session.ts`، `venues/queries.ts`، `next.config.mjs`، `storage/index.ts` (کامنت)، `package.json` (`images:optimize`)، مستندات.
- حذف: همهٔ `public/img/*.jpg` و `public/img/avatars/*.jpg`.

## تست‌ها (واقعی)
| بررسی | نتیجه |
|---|---|
| `tsc` / `eslint` / `next build` | بدون خطا و هشدار |
| Vitest | **۲۱۹/۲۱۹** (۸ تست جدید: نگاشت تصاویر، وجود فایل‌ها، حجم، `singleFlight`) |
| E2E فازهای ۱ تا ۱۱ و 8b/8c | همه سبز (۷۲ ۶۲ ۴۷ ۶۶ ۳۹ ۲۸ ۳۳ ۲۷ ۳۲ ۲۱ ۹ ۲۴ ۳۸) |
| E2E فاز ۱۲ | **۳۲/۳۲**: AVIF/WebP، هدر کش، ۴۰۴ برای JPEG قدیمی، حجم عکس‌ها، آواتار، debounce (یک درخواست پس از مکث، نه در حین تایپ، تک‌حرف ارسال نمی‌شود، پاک کردن، Enter) |

## نتیجهٔ اندازه‌گیری (Lighthouse موبایل، build محلی، قبل ← بعد)
| صفحه | Performance | LCP | TBT | حجم کل |
|---|---|---|---|---|
| خانه | ۶۱ ← **۸۸** | ۵٫۹ ← ۳٫۴ s | ۶۴۰ ← ۱۹۰ ms | ۱٫۳۷ MB ← ۵۴۷ KB |
| سالن‌ها | ۸۷ ← **۹۳** | ۳٫۳ ← ۳٫۱ s | ۲۵۰ ← ۸۰ ms | ۱٫۴۶ MB ← ۵۰۴ KB |
| صفحهٔ سالن | ۶۱ ← **۹۱** | ۷٫۰ ← ۳٫۱ s | ۵۴۰ ← ۱۳۰ ms | ۱٫۴۰ MB ← ۵۸۸ KB |
(محلی، بدون تأخیر شبکه، نوسان ±۱۰٪.) ظاهر سایت تغییر دیداری نکرده، پس اسکرین‌شات‌های README همان‌ها هستند.

## محدودیت‌ها
- مرورگرهایی که AVIF ندارند WebP می‌گیرند؛ `<img>` پشتیبان هم WebP است (همهٔ مرورگرهای امروزی).
- نیاز به debounce برای فیلترهای دیگر (قیمت، چک‌باکس‌ها) نبود چون با دکمهٔ «اعمال» ارسال می‌شوند.
- آیکون‌های PNG مربوط به PWA (۱۱۰ KB برای ۵۱۲px) فعلاً بدون تغییر (مرورگرها برای manifest PNG می‌خواهند).
- مانند قبل: `npm run db:reset` فایل ندارد؛ پرداخت شبیه‌سازی است.

## چک‌لیست پذیرش
- [ ] صفحهٔ اصلی و سالن‌ها ظاهر قبلی را دارند و عکس‌ها تیز و سریع می‌آیند (DevTools ← Network ← Img: فقط avif/webp).
- [ ] در `/sessions` در کادر «نام سالن» سریع تایپ کنید: فقط بعد از مکث کوتاه نتایج تغییر می‌کنند و آدرس `?q=` می‌گیرد.
- [ ] همین رفتار در `/teams` و پنل ادمین ← کاربران.
- [ ] چت: بین تب‌ها جابه‌جا شوید؛ در Network هرگز دو درخواست `messages` هم‌زمان نیست.
