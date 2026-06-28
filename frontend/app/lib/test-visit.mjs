import dotenv from 'dotenv';
dotenv.config({ path: '/home/honey/Projects/florisight/frontend/.env.local' });

import { createFarmVisit } from './agrisense-db.js';

const actor = {
  id: 'sup-1',
  role: 'Supervisor',
};

const farmId = 'farm-wrk-2';
const payload = {
  notes: 'Testing visit save log',
  category: 'General',
};

async function test() {
  try {
    console.log("Calling createFarmVisit...");
    const result = await createFarmVisit(actor, farmId, payload);
    console.log("Success! Result:", result);
    process.exit(0);
  } catch (err) {
    console.error("Error occurred:", err);
    process.exit(1);
  }
}

test();
