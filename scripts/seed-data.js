import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY!");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function seedData() {
    console.log("Seeding initial fleet cars...");

    const mockCars = [
        {
            name: "Toyota Camry Hybrid Ascent",
            modelYear: 2023,
            weeklyPrice: 350,
            bond: 500,
            status: "Available",
            image: "https://images.unsplash.com/photo-1629897048514-3dd7414df7fd?auto=format&fit=crop&q=80&w=800"
        },
        {
            name: "Toyota Camry Hybrid SL",
            modelYear: 2024,
            weeklyPrice: 400,
            bond: 500,
            status: "Available",
            image: "https://images.unsplash.com/photo-1550355291-bbee04a92027?auto=format&fit=crop&q=80&w=800"
        },
        {
            name: "Toyota Camry Hybrid Ascent Sport",
            modelYear: 2023,
            weeklyPrice: 380,
            bond: 500,
            status: "Available",
            image: "https://images.unsplash.com/photo-1590362891991-f776e747a588?auto=format&fit=crop&q=80&w=800"
        }
    ];

    const { data: cars, error: carsError } = await supabase
        .from('cars')
        .insert(mockCars)
        .select();

    if (carsError) {
        if (carsError.code === 'PGRST205') {
            console.error("ERROR: The 'cars' table does not exist yet. Please run the SQL schema in the Supabase Dashboard first!");
            process.exit(1);
        }
        console.error("Error seeding cars:", carsError);
        process.exit(1);
    }

    console.log(`Successfully seeded ${cars.length} cars!`);
    process.exit(0);
}

seedData();
