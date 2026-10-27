/**
 * Seed data for development and demo ONLY. All venues, names, neighbourhoods and phone numbers are fictional.
 * Refuses to run in production.
 */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db, schema, sqlClient } from './client';
import { parseAppEnv } from '../server/env';
import { tehranParts, tehranWallToUtc } from '../lib/i18n/jalali';

if (parseAppEnv(process.env.APP_ENV) === 'production') {
  console.error('Refusing to seed: APP_ENV is production (or unset).');
  process.exit(1);
}

const FUTSAL_SKILLS = [['shooting', 'شوت'], ['passing', 'پاس'], ['dribbling', 'دریبل'], ['defense', 'دفاع'], ['speed', 'سرعت'], ['stamina', 'استقامت']];
const VOLLEY_SKILLS = [['serving', 'سرویس'], ['receiving', 'دریافت'], ['setting', 'پاس‌دهی'], ['attacking', 'حمله'], ['blocking', 'دفاع روی تور'], ['defense', 'دفاع']];
const sk = (a: string[][]) => a.map(([key, nameFa]) => ({ key, nameFa }));

const VENUES = [
  { slug: 'aftab', name: 'سالن ورزشی آفتاب', nb: 'شهرک گلشن', addr: 'سمنان، شهرک گلشن، خیابان نمونه ۱۲، پلاک ۱۲۳', img: ['hall-a', 'hall-c', 'locker', 'shower', 'stands'], price: 250000, sports: ['futsal', 'volleyball'], fac: ['parking', 'locker', 'shower', 'internet', 'stands', 'lighting', 'cooling', 'heating'], cap: 20, surface: 'PVC استاندارد' },
  { slug: 'pars', name: 'سالن ورزشی پارس', nb: 'محله بهار', addr: 'سمنان، محله بهار، کوچه نمونه ۲۴', img: ['hall-b', 'hall-a', 'locker', 'shower'], price: 280000, sports: ['futsal', 'volleyball'], fac: ['parking', 'locker', 'shower', 'cafe', 'ac', 'lighting', 'firstaid'], cap: 30, surface: 'PVC استاندارد' },
  { slug: 'irannzamin', name: 'سالن ایران‌زمین', nb: 'شهرک آزادی', addr: 'سمنان، شهرک آزادی، بلوار نمونه، پلاک ۸', img: ['hall-c', 'hall-d', 'stands'], price: 300000, sports: ['futsal'], fac: ['parking', 'locker', 'shower', 'internet', 'ac'], cap: 20, surface: 'پارکت' },
  { slug: 'tehranpars-sample', name: 'سالن ورزشی نیلوفر', nb: 'محله کوثر', addr: 'سمنان، محله کوثر، خیابان نمونه ۳', img: ['hall-d', 'hall-b'], price: 220000, sports: ['futsal', 'volleyball'], fac: ['locker', 'shower', 'ac', 'cafe'], cap: 20, surface: 'PVC' },
  { slug: 'shahed', name: 'سالن شهدای گمنام', nb: 'شهرک فرهنگیان', addr: 'سمنان، شهرک فرهنگیان، کوچه نمونه ۵', img: ['hall-a', 'hall-d'], price: 300000, sports: ['futsal', 'volleyball'], fac: ['parking', 'locker', 'shower', 'internet', 'firstaid'], cap: 24, surface: 'PVC استاندارد' },
  { slug: 'olympic', name: 'سالن المپیک', nb: 'محله سعدی', addr: 'سمنان، محله سعدی، خیابان نمونه ۹', img: ['hall-c', 'hall-a', 'locker'], price: 350000, sports: ['futsal', 'volleyball'], fac: ['parking', 'locker', 'shower', 'ac', 'cafe', 'stands', 'lighting'], cap: 30, surface: 'پارکت حرفه‌ای' },
  { slug: 'nashat', name: 'سالن نشاط', nb: 'شهرک ولیعصر', addr: 'سمنان، شهرک ولیعصر، کوچه نمونه ۱۱', img: ['hall-b', 'hall-c'], price: 200000, sports: ['futsal'], fac: ['locker', 'shower', 'internet'], cap: 16, surface: 'PVC' },
  { slug: 'sitargan', name: 'سالن ستارگان', nb: 'محله پیروزی', addr: 'سمنان، محله پیروزی، بلوار نمونه، پلاک ۴۰', img: ['hall-d', 'hall-a', 'shower'], price: 280000, sports: ['volleyball', 'futsal'], fac: ['parking', 'locker', 'cafe', 'ac', 'heating'], cap: 20, surface: 'PVC' },
];

const USERS = [
  ['+989000000001', 'علی محمدی', 'player', 'p1'], ['+989000000002', 'مدیر سالن', 'venue_manager', 'p4'],
  ['+989000000003', 'ادمین', 'admin', 'p5'],
  ['+989000000011', 'رضا کریمی', 'player', 'p6'], ['+989000000012', 'مهدی رضایی', 'player', 'p7'],
  ['+989000000013', 'سینا رستمی', 'player', 'p8'], ['+989000000014', 'امیر احمدی', 'player', 'p9'],
  ['+989000000015', 'کیان شریفی', 'player', 'p10'], ['+989000000016', 'حامد کریمی', 'player', 'p11'],
] as const;

const REVIEWS = [
  [5, 'سالن خیلی تمیز و مجهز بود. محیطش محترم و پرسنل خیلی خوب بودن.'],
  [4, 'کیفیت زمین عالی بود فقط کمی قیمتش بالاست.'],
  [5, 'نورپردازی و سرویس بهداشتی عالی. حتماً دوباره رزرو می‌کنم.'],
  [4, 'جای پارک راحت پیدا می‌شد و زمین خوب بود.'],
  [5, 'برای بازی دوستانه عالیه، مدیریت سالن هم همکاری خوبی داشت.'],
];

async function main() {
  const d = db();
  await sqlClient()`TRUNCATE venue_reviews, player_sport_profiles, user_profiles, venue_managers, venue_images, venue_facilities,
    venue_sports, time_slots, venues, user_sessions, auth_challenges, dev_sms_outbox, users, cities, sports, platform_settings RESTART IDENTITY CASCADE`;

  const [city] = await d.insert(schema.cities).values([
    { nameFa: 'سمنان', slug: 'semnan', isDefault: true }, { nameFa: 'تهران', slug: 'tehran', isDefault: false },
  ]).returning();
  const [futsal, volley] = await d.insert(schema.sports).values([
    { key: 'futsal', nameFa: 'فوتسال', defaultCapacity: 10, skillCategories: sk(FUTSAL_SKILLS) },
    { key: 'volleyball', nameFa: 'والیبال', defaultCapacity: 12, skillCategories: sk(VOLLEY_SKILLS) },
  ]).returning();
  const sportId = { futsal: futsal.id, volleyball: volley.id } as Record<string, string>;

  await d.insert(schema.platformSettings).values([
    { key: 'hold_minutes', value: 15 }, { key: 'fee_percent_bp', value: 500 }, { key: 'fee_min_toman', value: 5000 },
  ]);

  const users = await d.insert(schema.users).values(USERS.map(([phoneE164, displayName, role, av]) => ({
    phoneE164, displayName, role: role as 'player', avatarUrl: `/img/avatars/${av}.jpg`, onboardedAt: new Date(),
  }))).returning();
  const owner = users[1];
  await d.insert(schema.userProfiles).values(users.map((u, i) => ({
    userId: u.id, cityId: city.id, preferredSports: ['futsal'], referralCode: `DEMO${i}`, preferredTime: 'evening',
    bio: u.role === 'player' ? 'علاقه‌مند به فوتبال، بازی‌های گروهی و دوستانه.' : '',
  })));
  const SELF = [[80, 75, 70, 82, 76], [72, 70, 66, 74, 70], [65, 60, 55, 70, 68], [78, 72, 68, 70, 75]];
  const futsalKeys = ['shooting', 'passing', 'dribbling', 'speed', 'stamina'];
  for (const [i, u] of users.filter((x) => x.role === 'player').entries()) {
    const s = SELF[i % SELF.length];
    const scores = Object.fromEntries(futsalKeys.map((k, j) => [k, s[j]]));
    await d.insert(schema.playerSportProfiles).values({
      userId: u.id, sportId: futsal.id, selfScores: scores, ovr: Math.round(s.reduce((a, b) => a + b, 0) / s.length),
      level: i % 3 === 0 ? 'intermediate' : i % 3 === 1 ? 'pro' : 'beginner',
    });
  }

  const reviewers = users.filter((u) => u.role === 'player');
  for (const [vi, v] of VENUES.entries()) {
    const [row] = await d.insert(schema.venues).values({
      ownerUserId: owner.id, cityId: city.id, slug: v.slug, name: v.name, neighborhood: v.nb, address: v.addr,
      description: `${v.name} با زمین استاندارد، نورپردازی مناسب و امکانات رفاهی کامل؛ مناسب بازی‌های دوستانه، تمرین تیمی و برگزاری مسابقات.`,
      status: 'published', capacity: v.cap, surface: v.surface, openHours: 'هر روز از ۷ صبح تا ۱۲ شب',
      lat: 35.57 + vi * 0.004, lng: 53.39 + vi * 0.003,
      rules: ['لغو رزرو تا ۲۴ ساعت قبل از بازی: بازگشت کامل وجه', 'لغو رزرو کمتر از ۲۴ ساعت: ۵۰٪ بازگشت وجه', 'عدم حضور در زمان مقرر: بدون بازگشت وجه', 'حضور با لباس ورزشی و کفش مخصوص الزامی است'],
    }).returning();
    await d.insert(schema.venueManagers).values({ venueId: row.id, userId: owner.id, role: 'owner' });
    await d.insert(schema.venueImages).values(v.img.map((k, sort) => ({ venueId: row.id, storageKey: `img/${k === 'locker' || k === 'shower' || k === 'stands' ? k : k}.jpg`, sort, alt: v.name })));
    await d.insert(schema.venueFacilities).values(v.fac.map((facilityKey) => ({ venueId: row.id, facilityKey })));
    await d.insert(schema.venueSports).values(v.sports.map((s) => ({ venueId: row.id, sportId: sportId[s], pricePerSlot: v.price, slotMinutes: 90, maxCapacity: v.cap })));

    // reviews (rating_avg is derived from them, never invented)
    const n = 3 + (vi % 3);
    const rv = Array.from({ length: n }, (_, i) => REVIEWS[(i + vi) % REVIEWS.length]);
    await d.insert(schema.venueReviews).values(rv.map(([rating, comment], i) => ({
      venueId: row.id, userId: reviewers[(i + vi) % reviewers.length].id, rating: rating as number, comment: comment as string,
      createdAt: new Date(Date.now() - (i + 1) * 3 * 86400_000),
    })));
    await d.execute(sql`UPDATE venues SET rating_avg = (SELECT round(avg(rating)::numeric, 2) FROM venue_reviews WHERE venue_id = ${row.id}),
      rating_count = (SELECT count(*) FROM venue_reviews WHERE venue_id = ${row.id}) WHERE id = ${row.id}`);

    // time slots for the next 10 days (Tehran wall-clock), 90 minutes each
    const t0 = tehranParts(new Date());
    const starts = [[16, 0], [17, 30], [19, 0], [20, 30], [22, 0]];
    const slots = [];
    for (let day = 0; day < 10; day++) {
      const base = new Date(Date.UTC(t0.y, t0.m - 1, t0.d + day));
      for (const [i, [h, m]] of starts.entries()) {
        const startsAt = tehranWallToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), h, m);
        if (startsAt.getTime() < Date.now()) continue;
        const sport = v.sports[(i + day) % v.sports.length];
        slots.push({ venueId: row.id, sportId: sportId[sport], startsAt, endsAt: new Date(startsAt.getTime() + 90 * 60000),
          price: v.price + (h >= 19 ? 30000 : 0) });
      }
    }
    await d.insert(schema.timeSlots).values(slots);
  }
  console.log('seeded:', VENUES.length, 'venues,', users.length, 'users');
  console.log('demo logins (OTP is shown on screen):');
  for (const u of USERS.slice(0, 3)) console.log(' ', u[0].replace('+98', '0'), '-', u[1], `(${u[2]})`);
  await sqlClient().end();
}
main().catch((e) => { console.error(e); process.exit(1); });
