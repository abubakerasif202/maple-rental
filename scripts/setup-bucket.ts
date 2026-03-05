import 'dotenv/config';
import { db } from '../api/db/index.js';

async function setupBucket() {
    const BUCKET_NAME = 'applications';
    console.log(`Ensuring bucket "${BUCKET_NAME}" exists...`);

    const { data: buckets, error: listError } = await db.storage.listBuckets();
    if (listError) {
        console.error("Error listing buckets:", listError);
        process.exit(1);
    }

    const bucketExists = buckets.some(b => b.name === BUCKET_NAME);
    if (!bucketExists) {
        const { error: createError } = await db.storage.createBucket(BUCKET_NAME, {
            public: true,
            fileSizeLimit: 10485760, // 10MB
        });

        if (createError) {
            console.error("Error creating bucket:", createError);
            process.exit(1);
        }
        console.log(`Bucket "${BUCKET_NAME}" created successfully (Public).`);
    } else {
        console.log(`Bucket "${BUCKET_NAME}" already exists!`);
    }
}

setupBucket();

