import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema({
  text: { type: String, required: true },
  type: {
    type: String,
    enum: ['mcq', 'true-false', 'short-text', 'essay'],
    required: true,
  },
  options: { type: [String], default: [] }, // for MCQ
  order: { type: Number, required: true },
  maxMarks: { type: Number, required: true, default: 10 },
}, { timestamps: true });

export const Question = mongoose.model('Question', questionSchema);
