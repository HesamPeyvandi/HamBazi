import { currentUser } from '@/server/auth/session';
import { favoriteIds } from '@/server/favorites';
import Link from 'next/link';
import { LayoutGrid, List } from 'lucide-react';
import { SearchBar } from '@/components/venues/SearchBar';
import { FilterForm } from '@/components/venues/FilterForm';
import { VenueGridCard, VenueListItem } from '@/components/venues/VenueCard';
import { EmptyState, Pagination } from '@/components/ui/misc';
import { getCities, getSportsList, searchVenues } from '@/server/venues/queries';
import { parseVenueParams } from '@/server/venues/params';
import { formatNumber, toFa } from '@/lib/i18n/digits';

export const metadata = { title: 'سالن‌های ورزشی' };

export default async function VenuesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { filters, view, raw } = parseVenueParams(sp);
  const [cities, sports, result] = await Promise.all([getCities(), getSportsList(), searchVenues(filters)]);
  const me = await currentUser(); const favs = me ? await favoriteIds(me.id) : null;

  const qs = (over: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const base: Record<string, string | string[] | undefined> = { ...sp, ...Object.fromEntries(Object.entries(over).map(([k, v]) => [k, v == null ? undefined : String(v)])) };
    for (const [k, v] of Object.entries(base)) for (const x of Array.isArray(v) ? v : v != null && v !== '' ? [v] : []) p.append(k, x);
    return `/venues?${p.toString()}`;
  };

  return (
    <>
      <section className="relative isolate overflow-hidden bg-brand-950 text-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/img/hall-b.jpg" alt="" aria-hidden className="absolute inset-0 -z-10 h-full w-full object-cover opacity-35" />
        <div className="container-page pb-10 pt-24">
          <nav aria-label="مسیر" className="mb-4 text-xs text-white/70"><Link href="/">خانه</Link> <span aria-hidden>›</span> سالن‌ها</nav>
          <h1 className="text-3xl font-extrabold sm:text-4xl">سالن‌های ورزشی</h1>
          <p className="mt-2 text-white/80">جستجو، مقایسه و رزرو سالن‌های ورزشی در سمنان و سایر شهرها</p>
          <div className="mt-6"><SearchBar cities={cities} sports={sports} values={{ city: filters.citySlug, sport: filters.sports?.[0], date: raw.date, hour: filters.hour?.toString() }} /></div>
        </div>
      </section>

      <div className="container-page mt-8 grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="lg:order-first">
          <details className="lg:hidden card mb-2 p-3"><summary className="cursor-pointer font-bold">فیلترها</summary>
            <div className="mt-3"><FilterForm f={filters} cities={cities} sports={sports} view={view} sort={filters.sort!} dateRaw={raw.date} /></div></details>
          <div className="hidden lg:block"><FilterForm f={filters} cities={cities} sports={sports} view={view} sort={filters.sort!} dateRaw={raw.date} /></div>
        </aside>

        <section aria-labelledby="results-title">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 id="results-title" className="font-bold">نتایج جستجو: {formatNumber(result.total)} سالن</h2>
            <div className="flex items-center gap-2">
              <form action="/venues" method="get" className="flex items-center gap-2">
                {Object.entries(sp).filter(([k]) => k !== 'sort' && k !== 'page').flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).map((x, i) => x != null && <input key={k + i} type="hidden" name={k} value={x} />))}
                <label className="sr-only" htmlFor="sort">مرتب‌سازی</label>
                <select id="sort" name="sort" defaultValue={filters.sort} className="field !min-h-10 !w-auto !py-1 text-sm">
                  <option value="popular">محبوب‌ترین</option><option value="rating">بالاترین امتیاز</option>
                  <option value="price_asc">ارزان‌ترین</option><option value="price_desc">گران‌ترین</option>
                </select>
                <button className="btn btn-ghost btn-sm !min-h-10" type="submit">اعمال</button>
              </form>
              <div className="flex h-10 items-center rounded-xl border border-line bg-white px-0.5" role="group" aria-label="نوع نمایش">
                <Link href={qs({ view: 'list', page: 1 })} aria-label="نمایش لیستی" aria-current={view === 'list'} className={`grid h-9 w-9 place-items-center rounded-lg ${view === 'list' ? 'bg-brand-600 text-white' : ''}`}><List className="h-4 w-4" /></Link>
                <Link href={qs({ view: 'grid', page: 1 })} aria-label="نمایش کارتی" aria-current={view === 'grid'} className={`grid h-9 w-9 place-items-center rounded-lg ${view === 'grid' ? 'bg-brand-600 text-white' : ''}`}><LayoutGrid className="h-4 w-4" /></Link>
              </div>
            </div>
          </div>

          {result.items.length === 0 ? (
            <EmptyState title="سالنی با این مشخصات پیدا نشد" text="فیلترها را کمی تغییر دهید یا پاک کنید." action={<Link href={`/venues?city=${filters.citySlug}`} className="btn btn-primary">پاک کردن فیلترها</Link>} />
          ) : view === 'grid' ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{result.items.map((v) => <VenueGridCard key={v.id} v={v} fav={favs ? favs.has(v.id) : null} />)}</div>
          ) : (
            <div className="space-y-4">{result.items.map((v) => <VenueListItem key={v.id} v={v} fav={favs ? favs.has(v.id) : null} />)}</div>
          )}
          <Pagination page={result.page} total={result.total} pageSize={result.pageSize} hrefFor={(p) => qs({ page: p })} />
          <p className="sr-only">صفحه {toFa(result.page)}</p>
        </section>
      </div>
    </>
  );
}
