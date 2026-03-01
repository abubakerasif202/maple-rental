import 'dotenv/config';
import { db } from '../src/db/index.js';

async function logCars() {
    const { data, error } = await db.from('cars').select('*');
    console.log('Error:', error);
    console.log('Data:', data);
    process.exit(0);
}

logCars();
