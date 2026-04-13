/**
 * Rehash script — run once after reverting to bcrypt.
 *
 * Handles all possible states a student document could be in:
 *   A) password = plain text,  no passwordHash  → hash it, store as passwordHash
 *   B) password = bcrypt hash, no passwordHash  → rename: move to passwordHash
 *   C) passwordHash = plain text               → hash it in place
 *   D) passwordHash = valid bcrypt hash        → already correct, skip
 *
 * Safe to run multiple times.
 *
 * Run with:  bun run src/rehash-passwords.ts
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/tlogic';

function isBcryptHash(val: unknown): boolean {
  return typeof val === 'string' && val.startsWith('$2');
}

async function run() {
  await mongoose.connect(MONGO_URI, { authSource: 'admin' });
  console.log('✅ Connected to MongoDB\n');

  const col = mongoose.connection.collection('students');
  const all = await col.find({}).toArray();
  console.log(`Found ${all.length} student(s) in DB\n`);

  let rehashed = 0;
  let renamed = 0;
  let skipped = 0;

  for (const doc of all) {
    const pw    = doc.password;
    const pwh   = doc.passwordHash;

    // ── Case D: already has a valid bcrypt passwordHash — nothing to do ──────
    if (isBcryptHash(pwh) && !pw) {
      console.log(`  ✅ Already correct: ${doc.studentId}`);
      skipped++;
      continue;
    }

    // ── Case B: password field contains a bcrypt hash — just rename it ───────
    if (isBcryptHash(pw) && !isBcryptHash(pwh)) {
      await col.updateOne(
        { _id: doc._id },
        { $set: { passwordHash: pw }, $unset: { password: '' } }
      );
      console.log(`  🔄 Renamed bcrypt password → passwordHash: ${doc.studentId}`);
      renamed++;
      continue;
    }

    // ── Case A: password is plain text — hash it, store as passwordHash ──────
    if (pw && !isBcryptHash(pw)) {
      const passwordHash = await bcrypt.hash(String(pw), 10);
      await col.updateOne(
        { _id: doc._id },
        { $set: { passwordHash }, $unset: { password: '' } }
      );
      console.log(`  🔐 Hashed plain password for: ${doc.studentId}`);
      rehashed++;
      continue;
    }

    // ── Case C: passwordHash exists but is plain text — hash it in place ─────
    if (pwh && !isBcryptHash(pwh)) {
      const passwordHash = await bcrypt.hash(String(pwh), 10);
      await col.updateOne({ _id: doc._id }, { $set: { passwordHash } });
      console.log(`  🔐 Hashed plain passwordHash for: ${doc.studentId}`);
      rehashed++;
      continue;
    }

    console.log(`  ⚠️  Unhandled state for: ${doc.studentId} — manual check needed`);
  }

  console.log(`\n🎉 Done!`);
  console.log(`   Rehashed (plain → bcrypt): ${rehashed}`);
  console.log(`   Renamed  (bcrypt pw → passwordHash): ${renamed}`);
  console.log(`   Skipped  (already correct): ${skipped}`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ Rehash failed:', err);
  process.exit(1);
});
