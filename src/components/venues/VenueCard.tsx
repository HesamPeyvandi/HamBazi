import Link from 'next/link';
import { MapPin, ParkingCircle, ShowerHead, Shirt, Wifi, Wind, Coffee, Heart, Star, Armchair, Flame, Snowflake, Lightbulb, Utensils, BriefcaseMedical, ArrowLeft } from 'lucide-react';
import { publicUrl } from '@/server/storage';
import { FACILITIES } from '@/lib/facilities';
import { formatDecimal, formatNumber, formatToman } from '@/lib/i18n/digits';
import { formatTime, formatJalaliWithWeekday } from '@/lib/i18n/jalali';
import { toggleFavoriteAction } from '@/server/favorites/actions';
import type { VenueCard as VC } from '@/server/venues/queries';

export const FAC_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  parking: ParkingCircle, locker: Shirt, shower: ShowerHead, ac: Wind, cafe: Coffee, internet: Wifi,
  heating: Flame, cooling: Snowflake, firstaid: BriefcaseMedical, lighting: Lightbulb, stands: Armchair, buffet: Utensils,
};

export function FacilityTags({ keys, max = 4 }: { keys: string[]; max?: number }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {keys.slice(0, max).map((k) => {
        const I = FAC_ICONS[k] ?? Wind;
        return <li key={k} className="tag"><I className="h-3.5 w-3.5 text-ink-500" aria-hidden />{FACILITIES[k] ?? k}</li>;
      })}
    </ul>
  );
}

/** Heart outside the card link (a button must not live inside an <a>). fav: true/false for a signed-in user, null for visitors. */
export function FavButton({ venueId, fav }: { venueId: string; fav?: boolean | null }) {
  const cls = 'absolute end-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-ink-700 shadow-sm hover:bg-white focus-visible:outline-2';
  if (fav === undefined || fav === null) return <Link href="/login?next=/favorites" aria-label="ورود برای ذخیرهٔ سالن" className={cls}><Heart className="h-5 w-5" aria-hidden /></Link>;
  return (
    <form action={toggleFavoriteAction.bind(null, venueId, !fav)}>
      <button className={cls} aria-label={fav ? 'حذف از علاقه‌مندی‌ها' : 'افزودن به علاقه‌مندی‌ها'} aria-pressed={fav}>
        <Heart className={`h-5 w-5 ${fav ? 'text-danger-fg' : ''}`} fill={fav ? 'currentColor' : 'none'} aria-hidden /></button>
    </form>
  );
}

export function VenueGridCard({ v, fav }: { v: VC; fav?: boolean | null }) {
  return (
    <article className="card group relative flex flex-col overflow-hidden">
      <FavButton venueId={v.id} fav={fav} />
      <Link href={`/venues/${v.slug}`} className="relative block aspect-[16/10] overflow-hidden bg-brand-50" aria-label={`مشاهدهٔ ${v.name}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={publicUrl(v.images[0] ?? 'img/hall-a.jpg')} alt={v.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        <span className="absolute start-3 bottom-3 inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2 py-1 text-xs font-bold text-white">
          <Star className="h-3.5 w-3.5" fill="#fff" aria-hidden />{formatDecimal(v.ratingAvg)}</span>
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="text-lg font-extrabold leading-snug"><Link href={`/venues/${v.slug}`}>{v.name}</Link></h3>
        <p className="flex items-center gap-1 text-xs text-ink-500"><MapPin className="h-3.5 w-3.5" aria-hidden />{v.cityName}، {v.neighborhood}</p>
        <p className="text-sm font-bold text-brand-600">از {formatToman(v.fromPrice)} / سانس</p>
        <FacilityTags keys={v.facilities} />
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
          {v.slots.length ? v.slots.map((s) => (
            <span key={s.id} className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold" title={formatJalaliWithWeekday(s.startsAt)}>{formatTime(s.startsAt)}</span>
          )) : <span className="text-xs text-ink-500">سانس خالی ثبت نشده</span>}
          <Link href={`/venues/${v.slug}`} className="ms-auto grid h-8 w-8 place-items-center rounded-lg border border-line" aria-label="جزئیات"><ArrowLeft className="h-4 w-4" /></Link>
        </div>
      </div>
    </article>
  );
}

export function VenueListItem({ v, fav }: { v: VC; fav?: boolean | null }) {
  return (
    <article className="card relative flex flex-col gap-4 overflow-hidden p-3 sm:flex-row sm:items-stretch">
      <div className="relative shrink-0 sm:w-64">
      <FavButton venueId={v.id} fav={fav} />
      <Link href={`/venues/${v.slug}`} className="relative block aspect-[16/10] h-full overflow-hidden rounded-xl sm:aspect-auto" aria-label={`مشاهدهٔ ${v.name}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={publicUrl(v.images[0] ?? 'img/hall-a.jpg')} alt={v.name} loading="lazy" className="h-full w-full object-cover" />
      </Link>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 py-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xl font-extrabold"><Link href={`/venues/${v.slug}`}>{v.name}</Link></h3>
          <span className="inline-flex items-center gap-1 text-sm font-bold"><Star className="h-4 w-4" fill="#f5b50a" stroke="#f5b50a" aria-hidden />{formatDecimal(v.ratingAvg)}
            <span className="text-xs font-normal text-ink-500">({formatNumber(v.ratingCount)})</span></span>
        </div>
        <p className="flex items-center gap-1 text-sm text-ink-500"><MapPin className="h-4 w-4" aria-hidden />{v.cityName}، {v.neighborhood}</p>
        <div className="flex flex-wrap gap-1.5">{v.sports.map((s) => <span key={s.key} className="pill pill-green">{s.nameFa}</span>)}</div>
        <FacilityTags keys={v.facilities} max={5} />
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line pt-3 sm:w-44 sm:flex-col sm:items-stretch sm:justify-center sm:border-s sm:border-t-0 sm:ps-4 sm:pt-0">
        <div className="sm:text-center"><p className="text-xl font-extrabold">{formatNumber(v.fromPrice)}</p><p className="text-xs text-ink-500">تومان / سانس</p></div>
        <Link href={`/venues/${v.slug}`} className="btn btn-primary btn-sm">مشاهده و رزرو</Link>
      </div>
    </article>
  );
}
