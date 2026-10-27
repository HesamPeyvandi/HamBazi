import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { getReliability } from './reliability';
import { blendCategory, type PeerScores } from './skill';

/** Public player profile (A9). Respects the player's privacy switches; viewers other than the owner never see the phone number. */
export async function getPublicProfile(viewerId: string | null, targetId: string) {
  const d = db();
  const [u] = await d.select().from(schema.users).where(and(eq(schema.users.id, targetId), eq(schema.users.status, 'active')));
  if (!u) return null;
  const [profile] = await d.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, targetId));
  const own = viewerId === targetId;
  const privacy = profile?.privacy ?? { showProfile: true, showHistory: true };
  if (!own && !privacy.showProfile) return { hidden: true as const, id: u.id, name: u.displayName, avatar: u.avatarUrl };
  const city = profile?.cityId ? (await d.select().from(schema.cities).where(eq(schema.cities.id, profile.cityId)))[0] : undefined;
  const sports = await d.select({ sport: schema.sports, p: schema.playerSportProfiles }).from(schema.playerSportProfiles)
    .innerJoin(schema.sports, eq(schema.sports.id, schema.playerSportProfiles.sportId)).where(eq(schema.playerSportProfiles.userId, targetId));
  const reliability = await getReliability(targetId);
  const showHistory = own || privacy.showHistory;
  const comments = showHistory ? await d.select({ c: schema.playerReviews, name: schema.users.displayName }).from(schema.playerReviews)
    .innerJoin(schema.users, eq(schema.users.id, schema.playerReviews.raterId)).where(eq(schema.playerReviews.targetId, targetId)).orderBy(desc(schema.playerReviews.createdAt)).limit(20) : [];
  return {
    hidden: false as const, id: u.id, name: u.displayName, avatar: u.avatarUrl, bio: profile?.bio ?? '', city: city?.nameFa ?? null, own, showHistory,
    sports: sports.map(({ sport, p }) => {
      const cats = (sport.skillCategories as { key: string; nameFa: string }[]);
      return { key: sport.key, nameFa: sport.nameFa, ovr: p.ovr, level: p.level, peerCount: p.peerCount,
        categories: cats.map((c) => ({ key: c.key, nameFa: c.nameFa, value: Math.round(blendCategory(p.selfScores[c.key], (p.peerScores as PeerScores)[c.key])) })) };
    }),
    reliability: { score: reliability.score, attended: reliability.attended, attendanceRate: reliability.attendanceRate, games: reliability.attended + reliability.noShow },
    comments: comments.filter((x) => x.c.comment).map((x) => ({ id: x.c.id, name: (x.name || 'کاربر').split(' ')[0], text: x.c.comment, at: x.c.createdAt })),
  };
}
