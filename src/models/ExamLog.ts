import mongoose from 'mongoose';

const examLogSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
    index: true,
  },
  event: { type: String, required: true },
  detail: { type: String, default: null },
  timestamp: { type: Date, default: Date.now },
  examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', default: null },
});

export const ExamLog = mongoose.model('ExamLog', examLogSchema);
