import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MapPin, Users, Layers, Clock, BadgeCheck, CalendarDays } from 'lucide-react';
import { Gallery } from '@/components/venues/Gallery';
import { FAC_ICONS } from '@/components/venues/VenueCard';
import { Avatar, Rating, Stars } from '@/components/ui/misc';
import { getVenueBySlug, slotsForDay } from '@/server/venues/queries';
import { publicUrl } from '@/server/storage';
import { FACILITIES } from '@/lib/facilities';
import { formatDecimal, formatNumber, formatToman, toFa } from '@/lib/i18n/digits';
import { JALALI_MONTHS, JALALI_WEEKDAYS, formatJalaliLong, formatJalaliWithWeekday, formatTime, jalaliToUtc, toJalali } from '@/lib/i18n/jalali';
import { isValidJalaaliDate } from 'jalaali-js';
import type { Metadata } from 'next';

type P = { params: Promise<{ slug: string }>; searchParams: Promise<{ day?: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const d = await getVenueBySlug((await params).slug);
  return { title: d ? d.venue.name : 'سالن پیدا نشد', description: d?.venue.description.slice(0, 150) };
}

export default async function VenuePage({ params, searchParams }: P) {
  const { slug } = await params;
  const data = await getVenueBySlug(slug);
  if (!data) notFound();
  const { venue: v, card, sports, reviews, ratingDistribution, cityName } = data;

  const now = new Date();
  const today = toJalali(now);
  const days = Array.from({ length: 7 }, (_, i) => toJalali(new Date(now.getTime() + i * 86400_000)));
  const dayParam = (await searchParams).day?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const sel = dayParam && isValidJalaaliDate(+dayParam[1], +dayParam[2], +dayParam[3])
    ? { jy: +dayParam[1], jm: +dayParam[2], jd: +dayParam[3] } : { jy: today.jy, jm: today.jm, jd: today.jd };
  const slots = (await slotsForDay(v.id, sel)).filter((s) => s.startsAt > now);
  const keyOf = (d: { jy: number; jm: number; jd: number }) => `${d.jy}-${String(d.jm).padStart(2, '0')}-${String(d.jd).padStart(2, '0')}`;
  const images = (card.images.length ? card.images : ['img/hall-a.jpg']).map(publicUrl);
  const fromPrice = Math.min(...sports.map((s) => s.price));
  const maxCount = Math.max(1, ...ratingDistribution.map((r) => r.count));

  return (
    <div className="container-page py-6">
      <nav aria-label="مسیر" className="mb-4 text-sm text-ink-500"><Link href="/">خانه</Link> › <Link href="/venues">سالن‌ها</Link> › {v.name}</nav>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <Gallery images={images} alt={v.name} />

        <aside className="card flex flex-col gap-4 p-6">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-extrabold">{v.name}<BadgeCheck className="h-6 w-6 text-brand-600" aria-label="تأییدشده توسط هم‌بازی" /></h1>
            <p className="mt-2 flex items-center gap-1 text-ink-500"><MapPin className="h-4 w-4 shrink-0" aria-hidden />{v.address}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Rating value={Number(v.ratingAvg)} count={v.ratingCount} size="md" />
            {sports.map((s) => <span key={s.key} className="pill pill-green">{s.nameFa}</span>)}
          </div>
          <p className="text-sm leading-7 text-ink-700">{v.description}</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-page p-3"><Users className="mx-auto h-5 w-5 text-brand-600" aria-hidden /><p className="mt-1 text-xs text-ink-500">ظرفیت</p><p className="font-bold">{toFa(v.capacity)} نفر</p></div>
            <div className="rounded-xl bg-page p-3"><Layers className="mx-auto h-5 w-5 text-brand-600" aria-hidden /><p className="mt-1 text-xs text-ink-500">کفپوش</p><p className="text-sm font-bold">{v.surface ?? '—'}</p></div>
            <div className="rounded-xl bg-page p-3"><Clock className="mx-auto h-5 w-5 text-brand-600" aria-hidden /><p className="mt-1 text-xs text-ink-500">مدت هر سانس</p><p className="font-bold">{toFa(sports[0]?.minutes ?? 90)} دقیقه</p></div>
          </div>
          <div className="rounded-xl bg-brand-50 p-4"><p className="text-sm text-ink-500">قیمت هر سانس</p>
            <p className="text-2xl font-extrabold text-brand-700">از {formatToman(fromPrice)}</p>
            <p className="help">قیمت نهایی بسته به روز و ساعت متفاوت است.</p></div>
          <a href="#slots" className="btn btn-primary"><CalendarDays className="h-5 w-5" aria-hidden />مشاهده سانس‌های موجود</a>
          <Link href={`/report?type=venue&id=${v.id}`} className="text-center text-xs text-ink-500 hover:text-brand-600">گزارش مشکل این سالن</Link>
        </aside>
      </div>

      <section id="slots" aria-labelledby="slots-title" className="card mt-8 scroll-mt-24 p-6">
        <h2 id="slots-title" className="section-title mb-4">سانس‌های در دسترس</h2>
        <ul className="flex gap-2 overflow-x-auto pb-2" aria-label="انتخاب روز">
          {days.map((d, i) => {
            const active = keyOf(d) === keyOf(sel);
            return (
              <li key={keyOf(d)} className="shrink-0">
                <Link href={`?day=${keyOf(d)}#slots`} scroll={false} aria-current={active ? 'date' : undefined}
                  className={`block min-w-[5.2rem] rounded-xl border px-3 py-2 text-center ${active ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white'}`}>
                  <span className="block text-xs">{i === 0 ? 'امروز' : JALALI_WEEKDAYS[d.weekdayIndex]}</span>
                  <span className="block font-bold">{toFa(d.jd)} {JALALI_MONTHS[d.jm - 1]}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-sm text-ink-500">{formatJalaliWithWeekday(jalaliToUtc(sel.jy, sel.jm, sel.jd, 12))}</p>
        {slots.length === 0 ? <p className="mt-3 rounded-xl bg-page p-4 text-ink-500">برای این روز سانس خالی ثبت نشده است.</p> : (
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {slots.map((s) => {
              const open = s.status === 'open';
              return (
                <li key={s.id}>
                  {open ? (
                    <Link href={`/book/${s.id}`} className="block rounded-xl border border-line p-3 text-center hover:border-brand-600 hover:bg-brand-50">
                      <span className="block text-lg font-extrabold">{formatTime(s.startsAt)}</span>
                      <span className="block text-xs text-ink-500">تا {formatTime(s.endsAt)}</span>
                      <span className="mt-1 block text-sm font-bold text-brand-700">{formatNumber(s.price)} تومان</span>
                    </Link>
                  ) : (
                    <div className="rounded-xl border border-line bg-page p-3 text-center text-ink-400" aria-label="رزرو شده">
                      <span className="block text-lg font-extrabold">{formatTime(s.startsAt)}</span><span className="block text-xs">رزرو شده</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="help mt-4">با انتخاب سانس می‌توانید کل سالن را رزرو کنید یا یک سانس باز بسازید. پرداخت در این نسخه شبیه‌سازی‌شده است.</p>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <section className="card p-6" aria-labelledby="fac-title">
          <h2 id="fac-title" className="section-title mb-4">امکانات سالن</h2>
          <ul className="grid grid-cols-2 gap-3">
            {card.facilities.map((k) => { const I = FAC_ICONS[k]; return (
              <li key={k} className="flex items-center gap-2 text-sm"><span className="grid h-9 w-9 place-items-center rounded-full bg-brand-50 text-brand-600">{I && <I className="h-4 w-4" />}</span>{FACILITIES[k] ?? k}</li>); })}
          </ul>
        </section>
        <section className="card p-6" aria-labelledby="rules-title">
          <h2 id="rules-title" className="section-title mb-4">قوانین و نکات</h2>
          <ul className="list-disc space-y-2 ps-5 text-sm leading-7 text-ink-700">{v.rules.map((r) => <li key={r}>{r}</li>)}</ul>
        </section>
        <section className="card p-6" aria-labelledby="loc-title">
          <h2 id="loc-title" className="section-title mb-4">موقعیت مکانی</h2>
          <p className="flex items-start gap-2 text-sm"><MapPin className="mt-1 h-4 w-4 shrink-0 text-brand-600" aria-hidden />{cityName}، {v.neighborhood}<br />{v.address}</p>
          <p className="mt-3 text-sm text-ink-500">ساعت فعالیت: {v.openHours}</p>
        </section>
      </div>

      <section className="card mt-8 p-6" aria-labelledby="rev-title">
        <h2 id="rev-title" className="section-title mb-5">نظرات کاربران</h2>
        <div className="grid gap-8 md:grid-cols-[14rem_1fr]">
          <div>
            <p className="text-4xl font-extrabold">{formatDecimal(Number(v.ratingAvg))}</p>
            <p className="text-sm text-ink-500">بر اساس {formatNumber(v.ratingCount)} نظر</p>
            <ul className="mt-3 space-y-1.5">{ratingDistribution.map((r) => (
              <li key={r.stars} className="flex items-center gap-2 text-xs"><span className="w-3">{toFa(r.stars)}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-page"><span className="block h-full rounded-full bg-brand-600" style={{ width: `${(r.count / maxCount) * 100}%` }} /></span></li>))}</ul>
          </div>
          <ul className="divide-y divide-line">
            {reviews.map((r) => (
              <li key={r.id} className="py-4 first:pt-0">
                <div className="flex items-center gap-3"><Avatar src={r.avatar} name={r.name} size={40} />
                  <div><p className="font-bold">{r.name}</p><p className="text-xs text-ink-500">{formatJalaliLong(r.createdAt)}</p></div>
                  <span className="ms-auto"><Stars value={r.rating} /></span></div>
                <p className="mt-2 text-sm leading-7 text-ink-700">{r.comment}</p>
              </li>
            ))}
            {reviews.length === 0 && <li className="text-ink-500">هنوز نظری ثبت نشده است.</li>}
          </ul>
        </div>
      </section>
    </div>
  );
}
