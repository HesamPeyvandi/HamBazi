import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'هم‌بازی — رزرو سالن ورزشی و پیدا کردن هم‌بازی',
    short_name: 'هم‌بازی',
    description: 'رزرو آسان سالن‌های ورزشی، پیدا کردن هم‌بازی و پرداخت مطمئن.',
    id: '/',
    start_url: '/',
    scope: '/',
    lang: 'fa',
    dir: 'rtl',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f6f9f8',
    theme_color: '#03352f',
    categories: ['sports', 'lifestyle'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'سالن‌ها', url: '/venues' },
      { name: 'سانس‌های باز', url: '/sessions' },
      { name: 'گفت‌وگوها', url: '/chat' },
    ],
  };
}
