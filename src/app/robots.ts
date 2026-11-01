import type { MetadataRoute } from 'next';

const base = () => (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: ['/', '/venues', '/sessions', '/teams'], disallow: ['/api/', '/admin', '/owner', '/chat', '/profile', '/settings', '/notifications', '/pay/', '/reservations', '/book/', '/login', '/register', '/onboarding', '/dashboard', '/favorites', '/report', '/rate/'] }],
    sitemap: `${base()}/sitemap.xml`,
  };
}
