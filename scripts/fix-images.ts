import 'dotenv/config';
import { db } from '../src/db/index.js';

async function fixImages() {
    const images = [
        "https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?q=80&w=1600&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1657872737697-737a2d123ef2?q=80&w=1600&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1624578571415-09e9b1991929?q=80&w=1600&auto=format&fit=crop"
    ];

    const { data: cars, error: fetchError } = await db.from('cars').select('*').order('id');

    if (fetchError) {
        console.error("Failed to fetch cars:", fetchError);
        process.exit(1);
    }

    for (let i = 0; i < cars.length; i++) {
        const imageUrl = images[i % images.length];
        await db.from('cars').update({ image: imageUrl }).eq('id', cars[i].id);
    }

    console.log('Successfully updated car images!');
    process.exit(0);
}

fixImages();
