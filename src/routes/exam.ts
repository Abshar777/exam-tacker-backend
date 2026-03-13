import { Router, Response } from 'express';
import { requireStudent, AuthRequest } from '../middleware/auth';
import { Question } from '../models/Question';
import { Answer } from '../models/Answer';
import { Student } from '../models/Student';

const router = Router();

const EXAM_DURATION_MS = 70 * 60 * 1000; // 70 minutes

// Confirm exam start — sets examStartedAt only once
router.post('/start', requireStudent, async (req: AuthRequest, res: Response) => {
  const student = await Student.findById(req.user!.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  if (student.examCompleted) return res.status(403).json({ error: 'Exam already submitted' });

  if (!student.examStartedAt) {
    student.examStartedAt = new Date();
    await student.save();
  }

  res.json({ examStartedAt: student.examStartedAt });
});

// Get all questions (ordered)
router.get('/questions', requireStudent, async (req: AuthRequest, res: Response) => {
  const questions = await Question.find().sort({ order: 1 }).select('-__v');
  res.json(questions);
});

// Get exam status: saved answers + time remaining
router.get('/status', requireStudent, async (req: AuthRequest, res: Response) => {
  const student = await Student.findById(req.user!.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });

  if (student.examCompleted)
    return res.json({ completed: true, timeRemainingMs: 0, answers: [] });

  const elapsed = student.examStartedAt
    ? Date.now() - student.examStartedAt.getTime()
    : 0;
  const timeRemainingMs = Math.max(0, EXAM_DURATION_MS - elapsed);

  const answers = await Answer.find({ studentId: req.user!.id });

  res.json({
    completed: false,
    examStartedAt: student.examStartedAt,
    timeRemainingMs,
    answers: answers.map((a) => ({
      questionId: a.questionId,
      answer: a.answer,
      savedAt: a.savedAt,
    })),
  });
});

// Save/update one answer (auto-save)
router.post('/answer', requireStudent, async (req: AuthRequest, res: Response) => {
  const { questionId, answer } = req.body;
  if (!questionId) return res.status(400).json({ error: 'questionId required' });

  const student = await Student.findById(req.user!.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  if (student.examCompleted)
    return res.status(403).json({ error: 'Exam already submitted' });

  // Check time limit
  if (student.examStartedAt) {
    const elapsed = Date.now() - student.examStartedAt.getTime();
    if (elapsed >= EXAM_DURATION_MS) {
      // Auto-submit
      student.examCompleted = true;
      student.examSubmittedAt = new Date();
      await student.save();
      return res.status(403).json({ error: 'Time expired. Exam submitted.' });
    }
  }

  await Answer.findOneAndUpdate(
    { studentId: req.user!.id, questionId },
    { answer, savedAt: new Date() },
    { upsert: true, new: true }
  );

  res.json({ saved: true });
});

// Get student's own grades (only after exam is submitted)
router.get('/grades', requireStudent, async (req: AuthRequest, res: Response) => {
  const student = await Student.findById(req.user!.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  if (!student.examCompleted) return res.status(403).json({ error: 'Exam not yet submitted' });

  const questions = await Question.find().sort({ order: 1 });
  const answers = await Answer.find({ studentId: req.user!.id });
  const answerMap = new Map(answers.map((a) => [a.questionId.toString(), a]));

  const isGraded = answers.some((a) => a.marksAwarded !== null);
  const totalMarks = answers.reduce((s, a) => s + (a.marksAwarded ?? 0), 0);
  const totalPossible = questions.reduce((s, q) => s + q.maxMarks, 0);

  const results = questions.map((q) => {
    const ans = answerMap.get(q._id.toString());
    return {
      question: { text: q.text, type: q.type, options: q.options, maxMarks: q.maxMarks, order: q.order },
      answer: ans?.answer ?? '',
      marksAwarded: ans?.marksAwarded ?? null,
      feedback: ans?.feedback ?? null,
    };
  });

  res.json({
    isGraded,
    totalMarks,
    totalPossible,
    submittedAt: student.examSubmittedAt,
    results,
  });
});

// Submit exam
router.post('/submit', requireStudent, async (req: AuthRequest, res: Response) => {
  const student = await Student.findById(req.user!.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  if (student.examCompleted)
    return res.status(400).json({ error: 'Exam already submitted' });

  student.examCompleted = true;
  student.examSubmittedAt = new Date();
  await student.save();

  res.json({ message: 'Exam submitted successfully', submittedAt: student.examSubmittedAt });
});

export default router;
