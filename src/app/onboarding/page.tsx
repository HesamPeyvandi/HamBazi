import { requireUser, safeRedirectPath } from '@/server/auth/rbac';
import { getCities, getSportsList } from '@/server/venues/queries';
import { getProfileData } from '@/server/profile';
import { OnboardingForm } from '@/components/forms/ProfileForms';

export const metadata = { title: 'تکمیل پروفایل' };

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeRedirectPath((await searchParams).next, '/profile');
  const user = await requireUser('/onboarding');
  const [cities, sports, { profile, skills, city }] = await Promise.all([getCities(), getSportsList(), getProfileData(user.id)]);
  return (
    <div className="container-page max-w-2xl py-10">
      <h1 className="text-3xl font-extrabold">به هم‌بازی خوش آمدید 👋</h1>
      <p className="mt-2 mb-6 text-ink-500">چند اطلاعات کوتاه تا بتوانیم بازیکنان و سانس‌های مناسب را پیشنهاد دهیم.</p>
      <div className="card p-6">
        <OnboardingForm next={next}
          sports={sports.map((s) => ({ key: s.key, nameFa: s.nameFa, skills: s.skillCategories }))}
          cities={cities}
          defaults={{ name: user.displayName, city: city?.slug ?? cities[0]?.slug ?? 'semnan', sports: profile?.preferredSports ?? [], time: profile?.preferredTime ?? undefined,
            scores: Object.fromEntries(skills.map((s) => [s.sportKey, s.selfScores])) }} />
      </div>
    </div>
  );
}
