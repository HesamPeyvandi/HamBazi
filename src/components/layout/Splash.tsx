import { Logo } from '@/components/ui/Logo';
import { SplashDismiss } from './SplashDismiss';

/**
 * Logo splash shown once per browser session (cookie `hb_splash`, read in the root layout).
 * Server-rendered, so it covers the page from the very first paint; styles live in globals.css (.hb-splash*).
 * A pure-CSS animation hides it after ~3.6 s even if JavaScript never runs, so it can never get stuck.
 */
export function Splash() {
  return (
    <div id="hb-splash" className="hb-splash" aria-hidden="true" data-testid="splash">
      <div className="hb-splash-inner">
        <Logo dark size="lg" />
        <p className="hb-splash-tag">رزرو سالن، پیدا کردن هم‌بازی</p>
        <span className="hb-splash-bar" />
      </div>
      <SplashDismiss />
    </div>
  );
}
