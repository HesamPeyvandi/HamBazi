import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';

export async function getProfileData(userId: string) {
  const d = db();
  const [profile] = await d.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, userId));
  const skills = await d.select({ sportKey: schema.sports.key, nameFa: schema.sports.nameFa, categories: schema.sports.skillCategories,
    selfScores: schema.playerSportProfiles.selfScores, ovr: schema.playerSportProfiles.ovr, level: schema.playerSportProfiles.level })
    .from(schema.playerSportProfiles).innerJoin(schema.sports, eq(schema.sports.id, schema.playerSportProfiles.sportId))
    .where(eq(schema.playerSportProfiles.userId, userId));
  const city = profile?.cityId ? (await d.select().from(schema.cities).where(eq(schema.cities.id, profile.cityId)))[0] : undefined;
  return { profile, skills, city };
}
