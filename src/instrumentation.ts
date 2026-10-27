export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== 'phase-production-build') {
    const { env } = await import('./server/env');
    env(); // throws => server refuses to start on unsafe configuration
  }
}
