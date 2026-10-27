import Link from 'next/link';
import { ShieldCheck, Star, Users, Zap, ArrowLeft, Volleyball, LayoutGrid } from 'lucide-react';
import { SearchBar } from '@/components/venues/SearchBar';
import { VenueGridCard } from '@/components/venues/VenueCard';
import { featuredVenues, getCities, getSportsList } from '@/server/venues/queries';

export const metadata = { title: 'هم‌بازی — سالن رو پیدا کن، هم‌بازیت رو هم' };

const BENEFITS = [
  { icon: Star, title: 'سالن‌های معتبر', text: 'با امتیاز و نظرات واقعی' },
  { icon: Zap, title: 'تکمیل ظرفیت سریع', text: 'پیدا کردن بازیکنان هم‌تیمی' },
  { icon: ShieldCheck, title: 'پرداخت امن', text: 'شفاف و بدون پرداخت‌های متنوع' },
  { icon: Users, title: 'جامعهٔ ورزشی فعال', text: 'با امکان تشکیل تیم‌های دائمی' },
];

export default async function HomePage() {
  const [cities, sports, venues] = await Promise.all([getCities(), getSportsList(), featuredVenues('semnan', 4)]);
  return (
    <>
      <section className="relative isolate overflow-hidden bg-brand-950 text-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/img/hero.jpg" alt="" aria-hidden className="absolute inset-y-0 end-0 -z-10 hidden h-full w-[48%] object-cover opacity-90 lg:block [mask-image:linear-gradient(to_right,black_55%,transparent)]" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/img/hall-a.jpg" alt="" aria-hidden className="absolute inset-0 -z-10 h-full w-full object-cover opacity-45 lg:hidden" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-brand-950 via-brand-950/40 to-brand-950/70 lg:bg-gradient-to-l lg:from-brand-950/90 lg:via-brand-950/40 lg:to-transparent" />
        <div className="container-page pb-10 pt-12 lg:pb-20 lg:pt-20">
          <div className="max-w-xl lg:ms-0">
            <h1 className="text-[2rem] font-extrabold leading-[1.35] sm:text-5xl lg:text-[3.4rem]">
              سالن رو پیدا کن،<br /><span className="text-accent">هم‌بازیت رو هم.</span>
            </h1>
            <p className="mt-4 max-w-md text-[0.95rem] leading-8 text-white/80">رزرو آسان سالن‌های ورزشی، پیدا کردن هم‌بازی و پرداخت مطمئن؛ همه در یک پلتفرم.</p>
          </div>
          <div className="mt-8 lg:mt-12"><SearchBar cities={cities} sports={sports} /></div>
          <ul className="mt-6 flex justify-center gap-8 lg:hidden" aria-label="ورزش‌ها">
            {sports.map((s) => (
              <li key={s.key}>
                <Link href={`/venues?sport=${s.key}`} className="flex flex-col items-center gap-2 text-sm font-semibold">
                  <span className={`grid h-16 w-16 place-items-center rounded-full ${s.key === 'futsal' ? 'bg-brand-600' : 'bg-[#575a86]'}`}>
                    {s.key === 'futsal' ? <LayoutGrid className="h-7 w-7" aria-hidden /> : <Volleyball className="h-7 w-7" aria-hidden />}
                  </span>{s.nameFa}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-label="مزایا" className="border-b border-line bg-white">
        <ul className="container-page grid grid-cols-2 gap-4 py-6 lg:grid-cols-4 lg:divide-x lg:divide-x-reverse lg:divide-line">
          {BENEFITS.map(({ icon: I, title, text }) => (
            <li key={title} className="flex items-center gap-3 lg:px-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600"><I className="h-6 w-6" aria-hidden /></span>
              <span><span className="block font-bold">{title}</span><span className="block text-xs text-ink-500">{text}</span></span>
            </li>
          ))}
        </ul>
      </section>

      <section className="container-page mt-10" aria-labelledby="popular">
        <div className="mb-5 flex items-center justify-between">
          <h2 id="popular" className="section-title">سالن‌های محبوب</h2>
          <Link href="/venues" className="inline-flex items-center gap-1 text-sm font-bold text-brand-600">مشاهده همه <ArrowLeft className="h-4 w-4" aria-hidden /></Link>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {venues.map((v) => <VenueGridCard key={v.id} v={v} />)}
        </div>
      </section>

      <section className="container-page mt-12">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-brand-800 to-brand-950 p-8 text-white sm:p-10">
          <div className="max-w-lg">
            <h2 className="text-2xl font-extrabold"><span className="text-accent">به بازی مورد علاقه‌ات</span> ملحق شو!</h2>
            <p className="mt-2 text-white/80">سانس‌های باز را ببین، به بازیکنان دیگر بپیوند و دوستان جدید پیدا کن.</p>
            <Link href="/sessions" className="btn mt-5 bg-brand-600 text-white hover:bg-[#026f3f]">مشاهده سانس‌های باز <ArrowLeft className="h-4 w-4" aria-hidden /></Link>
          </div>
        </div>
      </section>
    </>
  );
}
