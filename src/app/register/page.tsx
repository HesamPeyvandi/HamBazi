import { AuthShell } from '@/components/layout/AuthShell';
import { RegisterForm } from '@/components/forms/AuthForms';
export const metadata = { title: 'ثبت‌نام' };
export default function RegisterPage() {
  return <AuthShell title="ثبت‌نام در هم‌بازی" subtitle="برای شروع، اطلاعات زیر را وارد کنید."><RegisterForm /></AuthShell>;
}
