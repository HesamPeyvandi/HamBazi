'use client';
import { LogoMark } from '@/components/ui/Logo';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="container-page grid min-h-[60vh] place-items-center py-16 text-center" role="alert">
      <div>
        <LogoMark className="mx-auto h-16 w-16" color="#b42318" />
        <h1 className="mt-4 text-3xl font-extrabold">مشکلی پیش آمد</h1>
        <p className="mt-2 text-ink-500">لطفاً دوباره تلاش کنید. اگر مشکل ادامه داشت بعداً سر بزنید.</p>
        <button onClick={reset} className="btn btn-primary mt-6">تلاش دوباره</button>
      </div>
    </div>
  );
}
