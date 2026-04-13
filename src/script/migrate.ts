/**
 * Migration script — run once after the multi-exam refactor.
 *
 * What it does:
 *  1. Creates an exam called "Old Exam (Before Migration)"
 *  2. Assigns all orphan students  (examId: null) to that exam
 *     — also migrates passwordHash → password for students that still use the old field
 *  3. Assigns all orphan questions (examId: null) to that exam
 *  4. Assigns all orphan answers   (examId: null) to that exam
 *  5. Assigns all orphan exam logs (examId: null) to that exam
 *
 * Run with:
 *   bun run src/migrate.ts
 */

import mongoose from 'mongoose';
import { Exam }    from '../models/Exam';
import { Student } from '../models/Student';
import { Question } from '../models/Question';
import { Answer }  from '../models/Answer';
import { ExamLog } from '../models/ExamLog';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/tlogic';

async function run() {
  // ── Connect ────────────────────────────────────────────────────────────────
  await mongoose.connect(MONGO_URI, { authSource: 'admin' });
  console.log('✅ Connected to MongoDB\n');

  // ── 1. Create (or find) the legacy exam ───────────────────────────────────
  let legacyExam = await Exam.findOne({ name: 'Old Exam (Before Migration)' });

  if (legacyExam) {
    console.log(`ℹ️  Legacy exam already exists — reusing: ${legacyExam._id}`);
  } else {
    legacyExam = await Exam.create({
      name: 'Old Exam (Before Migration)',
      description: 'Auto-created by migration script. Contains all data from before the multi-exam update.',
      durationMinutes: 70,
    });
    console.log(`✅ Created legacy exam: ${legacyExam._id}`);
  }

  const examId = legacyExam._id;

  // ── 2. Migrate orphan students ─────────────────────────────────────────────
  // Use the raw collection so we can also rename passwordHash → password
  const studentCol = mongoose.connection.collection('students');

  // Find students that have no examId OR have examId = null
  const orphanStudents = await studentCol
    .find({ $or: [{ examId: null }, { examId: { $exists: false } }] })
    .toArray();

  console.log(`\n👥 Orphan students found: ${orphanStudents.length}`);

  let studentsMigrated = 0;
  for (const doc of orphanStudents) {
    const update: Record<string, unknown> = { examId };

    // If still using old passwordHash field — copy it to password
    if (doc.passwordHash && !doc.password) {
      update.password = doc.passwordHash;
    }

    await studentCol.updateOne(
      { _id: doc._id },
      { $set: update, $unset: { passwordHash: '' } }
    );
    studentsMigrated++;
  }
  console.log(`✅ Students migrated: ${studentsMigrated}`);

  // ── 3. Migrate orphan questions ────────────────────────────────────────────
  const questionResult = await Question.updateMany(
    { $or: [{ examId: null }, { examId: { $exists: false } }] },
    { $set: { examId } }
  );
  console.log(`\n❓ Questions migrated: ${questionResult.modifiedCount}`);

  // ── 4. Migrate orphan answers ──────────────────────────────────────────────
  const answerResult = await Answer.updateMany(
    { $or: [{ examId: null }, { examId: { $exists: false } }] },
    { $set: { examId } }
  );
  console.log(`📝 Answers migrated:   ${answerResult.modifiedCount}`);

  // ── 5. Migrate orphan exam logs ────────────────────────────────────────────
  const logResult = await ExamLog.updateMany(
    { $or: [{ examId: null }, { examId: { $exists: false } }] },
    { $set: { examId } }
  );
  console.log(`📋 Exam logs migrated: ${logResult.modifiedCount}`);

  // ── Done ───────────────────────────────────────────────────────────────────
  console.log('\n🎉 Migration complete!\n');
  console.log(`   Exam:      Old Exam (Before Migration)`);
  console.log(`   Exam ID:   ${examId}`);
  console.log(`   Students:  ${studentsMigrated}`);
  console.log(`   Questions: ${questionResult.modifiedCount}`);
  console.log(`   Answers:   ${answerResult.modifiedCount}`);
  console.log(`   Logs:      ${logResult.modifiedCount}`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
