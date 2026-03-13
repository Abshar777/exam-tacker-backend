import mongoose from 'mongoose';

const answerSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
  answer: { type: String, default: '' },
  savedAt: { type: Date, default: Date.now },
  marksAwarded: { type: Number, default: null },
  feedback: { type: String, default: null },
}, { timestamps: true });

answerSchema.index({ studentId: 1, questionId: 1 }, { unique: true });

export const Answer = mongoose.model('Answer', answerSchema);
