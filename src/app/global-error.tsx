'use client';

/** Last resort when the root layout itself fails (no app CSS/layout is available, so it is fully self-contained). */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="fa" dir="rtl">
      <body style={{ fontFamily: 'Tahoma, sans-serif', display: 'grid', placeItems: 'center', minHeight: '100vh', margin: 0, textAlign: 'center', background: '#f5f8f7' }}>
        <div role="alert">
          <h1>مشکلی پیش آمد</h1>
          <p>لطفاً دوباره تلاش کنید.</p>
          <button onClick={reset} style={{ padding: '12px 24px', borderRadius: 12, border: 0, background: '#02834a', color: '#fff', fontSize: 16 }}>تلاش دوباره</button>
        </div>
      </body>
    </html>
  );
}
