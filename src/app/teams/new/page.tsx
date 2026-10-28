import { requireUser } from '@/server/auth/rbac';
import { createTeamAction } from '@/server/teams/actions';
import { JOIN_MODES } from '@/server/teams';
import { getCities, getSportsList } from '@/server/venues/queries';
import { getProfileData } from '@/server/profile';

export const metadata = { title: 'ساخت تیم' };
export default async function NewTeam({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const u = await requireUser('/teams/new');
  const [cities, sports, { profile }] = await Promise.all([getCities(), getSportsList(), getProfileData(u.id)]);
  const q = await searchParams;
  return (
    <div className="container-page max-w-xl py-8"><h1 className="mb-5 text-3xl font-extrabold">ساخت تیم</h1>
      {q.err && <p role="alert" className="mb-4 rounded-xl bg-danger-bg p-3 text-sm text-danger-fg">{q.err}</p>}
      <form action={createTeamAction} className="card space-y-4 p-6">
        <div><label className="label" htmlFor="name">نام تیم</label><input id="name" name="name" required minLength={3} maxLength={40} className="field" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label" htmlFor="sportId">ورزش</label><select id="sportId" name="sportId" className="field">{sports.map((s) => <option key={s.id} value={s.id}>{s.nameFa}</option>)}</select></div>
          <div><label className="label" htmlFor="cityId">شهر</label><select id="cityId" name="cityId" defaultValue={profile?.cityId ?? undefined} className="field">{cities.map((c) => <option key={c.id} value={c.id}>{c.nameFa}</option>)}</select></div></div>
        <div><label className="label" htmlFor="description">دربارهٔ تیم (اختیاری)</label><textarea id="description" name="description" rows={3} maxLength={400} className="field" /></div>
        <div><label className="label" htmlFor="joinMode">روش عضوگیری</label><select id="joinMode" name="joinMode" defaultValue="request" className="field">{Object.entries(JOIN_MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label className="label" htmlFor="maxMembers">حداکثر اعضا</label><input id="maxMembers" name="maxMembers" type="number" min={2} max={50} defaultValue={20} className="field" /></div>
        <button className="btn btn-primary w-full">ساخت تیم</button>
        <p className="help">شما کاپیتان تیم می‌شوید. هر نفر می‌تواند عضو حداکثر ۵ تیم باشد.</p></form></div>
  );
}
