import Link from 'next/link';
import { currentUser } from '@/server/auth/session';
import { listMySupport, TOPICS } from '@/server/support';
import { sendSupportAction } from '@/server/support/actions';
import { formatJalaliShort } from '@/lib/i18n/jalali';

export const metadata = { title: 'راهنما و تماس با ما' };
export const dynamic = 'force-dynamic';

const FAQ: [string, string][] = [
  ['چطور یک سالن را رزرو کنم؟', 'از صفحهٔ سالن، یکی از سانس‌های خالی را انتخاب کنید و شیوهٔ پرداخت را بزنید. سانس تا ۱۵ دقیقه برای شما نگه داشته می‌شود؛ اگر در این مدت پرداخت نکنید، آزاد می‌شود.'],
  ['«همه را من می‌پردازم» و «تقسیم بین بازیکنان» چه فرقی دارند؟', 'در حالت اول کل سانس را خودتان می‌پردازید. در حالت دوم یک سانس باز ساخته می‌شود و فقط تعداد بازیکنان را می‌دهید؛ سهم هر نفر خودکار حساب می‌شود و سانس وقتی قطعی است که همهٔ بازیکنان پرداخت کرده باشند.'],
  ['اگر سانس پر شود و من هنوز بخواهم بیایم؟', 'در صفحهٔ سانس به لیست انتظار بپیوندید. هر وقت جایی خالی شود، به‌ترتیب نوبت به شما اعلان می‌دهیم.'],
  ['بازگشت وجه چگونه است؟', 'طبق سیاست لغو نمایش‌داده‌شده قبل از پرداخت. اگر کسی جای شما را بگیرد، مابه‌التفاوت بازگشت وجه شما هم تکمیل می‌شود. جزئیات در صفحهٔ سیاست لغو است.'],
  ['پرداخت‌ها واقعی هستند؟', 'خیر. در این نسخه پرداخت‌ها شبیه‌سازی‌شده‌اند و پولی از شما کم نمی‌شود.'],
  ['امتیاز تعهد و مهارت چطور حساب می‌شود؟', 'تعهد از حضور، لغو دیرهنگام و غیبت می‌آید و مهارت از خودارزیابی شما و امتیاز هم‌بازی‌ها؛ این دو کاملاً جدا هستند و مبتدی بودن جریمه ندارد.'],
  ['چطور مزاحمت یا تخلف را گزارش کنم؟', 'در صفحهٔ بازیکن، سانس، سالن یا کنار هر پیام گفت‌وگو دکمهٔ «گزارش» هست. گزارش‌ها را مدیر بررسی می‌کند.'],
];

export default async function HelpPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const q = await searchParams; const user = await currentUser();
  const mine = user ? await listMySupport(user.id) : [];
  return (
    <div className="container-page max-w-3xl py-8">
      <h1 className="text-2xl font-extrabold">راهنما و تماس با ما</h1>
      <section className="mt-5 space-y-2" aria-label="پرسش‌های پرتکرار">
        {FAQ.map(([qn, a]) => <details key={qn} className="card p-4"><summary className="cursor-pointer font-bold">{qn}</summary><p className="mt-2 text-sm leading-8 text-ink-700">{a}</p></details>)}
      </section>
      <section id="contact" className="card mt-6 p-6" aria-labelledby="contact-t">
        <h2 id="contact-t" className="section-title mb-3">پیام به پشتیبانی</h2>
        {q.ok && <p role="status" className="mb-3 rounded-xl bg-brand-50 p-3 text-sm font-semibold text-brand-700">پیام شما ثبت شد؛ پس از بررسی، نتیجه از طریق پشتیبانی اطلاع داده می‌شود.</p>}
        {q.err && <p role="alert" className="mb-3 rounded-xl bg-danger-bg p-3 text-sm text-danger-fg">{q.err}</p>}
        {user ? (
          <form action={sendSupportAction} className="space-y-3">
            <div><label className="label" htmlFor="topic">موضوع</label><select id="topic" name="topic" className="field">{Object.entries(TOPICS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
            <div><label className="label" htmlFor="body">پیام شما</label><textarea id="body" name="body" rows={5} minLength={10} maxLength={2000} required className="field" /></div>
            <button className="btn btn-primary">ارسال پیام</button>
          </form>
        ) : <p className="text-sm">برای ارسال پیام ابتدا <Link className="font-bold text-brand-600" href="/login?next=/help">وارد شوید</Link>.</p>}
        {mine.length > 0 && (
          <div className="mt-5"><h3 className="mb-2 text-sm font-bold">پیام‌های قبلی شما</h3>
            <ul className="divide-y divide-line text-sm">{mine.map((m) => <li key={m.id} className="flex items-center justify-between gap-3 py-2"><span>{TOPICS[m.topic] ?? m.topic} · {formatJalaliShort(m.createdAt)}</span><span className={`pill ${m.status === 'open' ? 'pill-info' : 'pill-green'}`}>{m.status === 'open' ? 'در حال بررسی' : 'بسته شد'}</span></li>)}</ul></div>)}
      </section>
    </div>
  );
}
