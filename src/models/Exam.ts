import mongoose from 'mongoose';

const examSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  durationMinutes: { type: Number, required: true, default: 70 },
}, { timestamps: true });

export const Exam = mongoose.model('Exam', examSchema);
