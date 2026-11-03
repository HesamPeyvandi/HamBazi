// Vercel build entry (package.json "vercel-build"): prepares the database from the build servers, then builds the app.
// Why: the build runs on Vercel's network, which can reach Neon even when your own network cannot.
//  1. Applies pending SQL migrations (idempotent). Uses DATABASE_URL_UNPOOLED when present (Neon's direct URL), else DATABASE_URL.
//  2. If SEED_IF_EMPTY=1 and APP_ENV is not "production": loads the demo data ONLY when the database has no cities yet.
//     (The seed script wipes tables, so it is never run on a database that already has data.)
//  3. next build.
// Only the production environment touches the database; preview builds skip steps 1–2. "--db-only" stops after step 2.
import { spawnSync } from 'node:child_process';
import postgres from 'postgres';

const run = (cmd, args, env = {}) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, ...env } });
  if (r.status !== 0) { console.error(`\n✖ "${cmd} ${args.join(' ')}" failed`); process.exit(r.status ?? 1); }
};
const onVercel = !!process.env.VERCEL_ENV;
const touchDb = !onVercel || process.env.VERCEL_ENV === 'production';

if (touchDb && process.env.DATABASE_URL) {
  const direct = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  console.log('▶ applying database migrations');
  run('npx', ['tsx', 'src/db/migrate.ts'], { DATABASE_URL: direct });
  if (process.env.SEED_IF_EMPTY === '1' && process.env.APP_ENV !== 'production') {
    const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
    const [{ n }] = await sql`select count(*)::int as n from cities`;
    await sql.end();
    if (n === 0) { console.log('▶ database is empty: loading demo data'); run('npx', ['tsx', 'src/db/seed.ts']); }
    else console.log(`▶ demo data not loaded (database already has data: ${n} cities)`);
  }
} else console.log('▶ database steps skipped (' + (touchDb ? 'no DATABASE_URL' : `VERCEL_ENV=${process.env.VERCEL_ENV}`) + ')');

if (!process.argv.includes('--db-only')) run('npx', ['next', 'build']);
