import { parseTimes } from '@/lib/play-times';
import { requireUser } from '@/server/auth/rbac';
import { getProfileData } from '@/server/profile';
import { getSportsList } from '@/server/venues/queries';
import { EditProfileForm } from '@/components/forms/ProfileForms';

export const metadata = { title: 'ویرایش پروفایل' };
export default async function EditProfile() {
  const user = await requireUser('/profile/edit');
  const [{ profile }, sports] = await Promise.all([getProfileData(user.id), getSportsList()]);
  return (
    <div className="container-page max-w-2xl py-8">
      <h1 className="mb-5 text-3xl font-extrabold">ویرایش پروفایل</h1>
      <div className="card p-6"><EditProfileForm sports={sports} defaults={{ name: user.displayName, bio: profile?.bio ?? '', sports: profile?.preferredSports ?? [], times: parseTimes(profile?.preferredTime),
        showProfile: profile?.privacy.showProfile ?? true, showHistory: profile?.privacy.showHistory ?? true }} /></div>
    </div>
  );
}
