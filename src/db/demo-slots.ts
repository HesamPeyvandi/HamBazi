import { ensureSlots } from './slot-generator';

/** Demo tool (`npm run db:slots`): gives venues without a schedule the demo default and generates the next 14 days of slots. Idempotent. */
export async function extendDemoSlots(): Promise<number> {
  return ensureSlots(null, { demoDefaults: true });
}
