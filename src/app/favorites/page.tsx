import Link from 'next/link';
import { requireUser } from '@/server/auth/rbac';
import { favoriteIds, listFavoriteVenueIds } from '@/server/favorites';
import { hydrate } from '@/server/venues/queries';
import { VenueGridCard } from '@/components/venues/VenueCard';
import { EmptyState } from '@/components/ui/misc';

export const metadata = { title: 'علاقه‌مندی‌ها' };
export const dynamic = 'force-dynamic';

export default async function FavoritesPage() {
  const u = await requireUser('/favorites');
  const ids = await listFavoriteVenueIds(u.id);
  const [cards, favs] = await Promise.all([ids.length ? hydrate(ids) : Promise.resolve([]), favoriteIds(u.id)]);
  const order = new Map(ids.map((id, i) => [id, i]));
  cards.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return (
    <div className="container-page py-8">
      <h1 className="mb-1 text-2xl font-extrabold">علاقه‌مندی‌ها</h1>
      <p className="mb-5 text-sm text-ink-500">سالن‌هایی که ذخیره کرده‌اید؛ برای دسترسی سریع به سانس‌های خالی‌شان.</p>
      {cards.length === 0 ? <EmptyState title="هنوز سالنی ذخیره نکرده‌اید" text="روی قلب کنار هر سالن بزنید تا اینجا ظاهر شود." action={<Link href="/venues" className="btn btn-primary">دیدن سالن‌ها</Link>} />
        : <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{cards.map((v) => <VenueGridCard key={v.id} v={v} fav={favs.has(v.id)} />)}</div>}
    </div>
  );
}
