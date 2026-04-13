import mongoose from 'mongoose';

const studentSchema = new mongoose.Schema({
  studentId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  password: { type: String, required: true },
  examStartedAt: { type: Date, default: null },
  examSubmittedAt: { type: Date, default: null },
  examCompleted: { type: Boolean, default: false },
  suspendedReason: { type: String, default: null },
  examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', default: null },
}, { timestamps: true });

export const Student = mongoose.model('Student', studentSchema);
