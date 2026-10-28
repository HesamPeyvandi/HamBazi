import Link from 'next/link';
import { Plus, Users } from 'lucide-react';
import { currentUser } from '@/server/auth/session';
import { listTeams, teamsOfUser, type JoinMode } from '@/server/teams';
import { getCities, getSportsList } from '@/server/venues/queries';
import { EmptyState, Pagination } from '@/components/ui/misc';
import { toFa } from '@/lib/i18n/digits';

export const metadata = { title: 'تیم‌ها و گروه‌ها' };
const UUID = /^[0-9a-f-]{36}$/i;
const OK: Record<string, string> = { left: 'از تیم خارج شدید.', disbanded: 'تیم منحل شد.' };
const MODE_PILL: Record<JoinMode, [string, string]> = { public: ['عمومی', 'pill-green'], request: ['با درخواست', 'pill-info'], invite_only: ['فقط با دعوت', 'pill-warn'] };

export default async function TeamsPage({ searchParams }: { searchParams: Promise<{ sport?: string; city?: string; q?: string; page?: string; ok?: string }> }) {
  const q = await searchParams;
  const user = await currentUser();
  const [cities, sports, mine] = await Promise.all([getCities(), getSportsList(), user ? teamsOfUser(user.id) : Promise.resolve([])]);
  const page = Math.max(1, parseInt(q.page ?? '1', 10) || 1);
  const { rows, total } = await listTeams({ sportId: q.sport && UUID.test(q.sport) ? q.sport : undefined, cityId: q.city && UUID.test(q.city) ? q.city : undefined, q: q.q?.slice(0, 40), page });
  const href = (p: number) => `/teams?${new URLSearchParams({ ...(q.sport ? { sport: q.sport } : {}), ...(q.city ? { city: q.city } : {}), ...(q.q ? { q: q.q } : {}), page: String(p) })}`;
  return (
    <div className="container-page py-8">
      {q.ok && OK[q.ok] && <p role="status" className="mb-4 rounded-xl bg-brand-50 p-3 text-sm font-semibold text-brand-700">{OK[q.ok]}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl font-extrabold">تیم‌ها و گروه‌ها</h1>
        <Link href="/teams/new" className="btn btn-primary"><Plus className="h-4 w-4" aria-hidden />ساخت تیم</Link></div>
      <p className="mt-2 text-ink-700">با هم‌تیمی‌های ثابتت بازی کن، یا به یک تیم نزدیک به سطح خودت بپیوند.</p>

      {mine.length > 0 && <section className="mt-6" aria-labelledby="mine-t"><h2 id="mine-t" className="section-title mb-3">تیم‌های من</h2>
        <ul className="flex flex-wrap gap-2">{mine.map((t) => <li key={t.id}><Link href={`/teams/${t.id}`} className="pill pill-green !px-4 !py-2 !text-sm">{t.name}{t.role === 'captain' ? ' · کاپیتان' : ''}</Link></li>)}</ul></section>}

      <form className="mt-6 flex flex-wrap items-end gap-3" role="search" aria-label="جستجوی تیم">
        <div className="min-w-48 flex-1"><label className="label" htmlFor="tq">نام تیم</label><input id="tq" name="q" defaultValue={q.q ?? ''} className="field" /></div>
        <div><label className="label" htmlFor="ts">ورزش</label><select id="ts" name="sport" defaultValue={q.sport ?? ''} className="field"><option value="">همه</option>{sports.map((s) => <option key={s.id} value={s.id}>{s.nameFa}</option>)}</select></div>
        <div><label className="label" htmlFor="tc">شهر</label><select id="tc" name="city" defaultValue={q.city ?? ''} className="field"><option value="">همه</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.nameFa}</option>)}</select></div>
        <button className="btn btn-outline">جستجو</button></form>
      <p className="help mt-3">{toFa(total)} تیم</p>

      <div className="mt-3">{rows.length === 0 ? <EmptyState title="تیمی پیدا نشد" text="اولین تیم را شما بسازید!" action={<Link href="/teams/new" className="btn btn-primary">ساخت تیم</Link>} /> : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{rows.map((r) => (
          <li key={r.t.id}><Link href={`/teams/${r.t.id}`} className="card block h-full p-5 transition hover:border-brand-600">
            <div className="flex items-start justify-between gap-2"><h3 className="text-lg font-extrabold">{r.t.name}</h3><span className={`pill ${MODE_PILL[r.t.joinMode as JoinMode][1]}`}>{MODE_PILL[r.t.joinMode as JoinMode][0]}</span></div>
            <p className="mt-1 text-sm text-ink-500">{r.sportName} · {r.cityName}</p>
            {r.t.description && <p className="mt-2 line-clamp-2 text-sm leading-6 text-ink-700">{r.t.description}</p>}
            <p className="mt-3 flex items-center gap-4 text-sm text-ink-700"><span className="inline-flex items-center gap-1"><Users className="h-4 w-4" aria-hidden />{toFa(r.count)} از {toFa(r.t.maxMembers)}</span>{r.avgOvr > 0 && <span>میانگین OVR: <b>{toFa(r.avgOvr)}</b></span>}</p>
          </Link></li>))}</ul>)}</div>
      <div className="mt-6"><Pagination page={page} total={total} pageSize={12} hrefFor={href} /></div>
    </div>
  );
}
