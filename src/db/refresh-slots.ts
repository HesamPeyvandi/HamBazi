// Adds the missing demo slots for the next 14 days (idempotent, never deletes). Usage: npm run db:slots
import 'dotenv/config';
import { sqlClient } from './client';
import { extendDemoSlots } from './demo-slots';

const days = Math.min(60, Math.max(1, Number(process.argv[2]) || 14));
const added = await extendDemoSlots(days);
console.log(`demo slots: ${added} added for the next ${days} days (existing slots untouched)`);
await sqlClient().end();
