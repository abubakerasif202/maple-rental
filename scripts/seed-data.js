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
            model_year: 2023,
            weekly_price: 350,
            bond: 500,
            status: "Available",
            image: "https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?q=80&w=1600&auto=format&fit=crop"
        },
        {
            name: "Toyota Camry Hybrid SL",
            model_year: 2024,
            weekly_price: 400,
            bond: 500,
            status: "Available",
            image: "https://images.unsplash.com/photo-1657872737697-737a2d123ef2?q=80&w=1600&auto=format&fit=crop"
        },
        {
            name: "Toyota Camry Hybrid Ascent Sport",
            model_year: 2023,
            weekly_price: 380,
            bond: 500,
            status: "Available",
            image: "https://images.unsplash.com/photo-1624578571415-09e9b1991929?q=80&w=1600&auto=format&fit=crop"
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
