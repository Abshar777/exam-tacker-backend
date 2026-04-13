/**
 * Reset passwords script — sets every student's password to their Student ID (plain text).
 * Removes any leftover passwordHash field.
 *
 * Run with:  bun run src/reset-passwords.ts
 */

import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/tlogic';

async function run() {
  await mongoose.connect(MONGO_URI, { authSource: 'admin' });
  console.log('✅ Connected to MongoDB\n');

  const col = mongoose.connection.collection('students');
  const students = await col.find({}).toArray();
  console.log(`Found ${students.length} student(s)\n`);

  for (const doc of students) {
    await col.updateOne(
      { _id: doc._id },
      {
        $set:   { password: doc.studentId },
        $unset: { passwordHash: '' },
      }
    );
    console.log(`  ✅ ${doc.studentId}  →  password set to "${doc.studentId}"`);
  }

  console.log(`\n🎉 Done! All ${students.length} student(s) reset.`);
  console.log('   Default password = their Student ID');
  console.log('   Admin can change individual passwords via the Edit button in the portal.\n');

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ Reset failed:', err);
  process.exit(1);
});
