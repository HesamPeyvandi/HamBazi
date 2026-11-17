// Adds the missing demo slots for the next 14 days (idempotent, never deletes). Usage: npm run db:slots
import 'dotenv/config';
import { sqlClient } from './client';
import { extendDemoSlots } from './demo-slots';

const days = 14;
const added = await extendDemoSlots();
console.log(`demo slots: ${added} added for the next ${days} days (existing slots untouched)`);
await sqlClient().end();
