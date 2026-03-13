import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { requireAdmin, AuthRequest } from '../middleware/auth';
import { Student } from '../models/Student';
import { Question } from '../models/Question';
import { Answer } from '../models/Answer';

const router = Router();

// ── Students ──────────────────────────────────────────────────────────────────

// List all students
router.get('/students', requireAdmin, async (_req: AuthRequest, res: Response) => {
  const students = await Student.find().select('-passwordHash -__v').sort({ createdAt: -1 });
  res.json(students);
});

// Create student
router.post('/students', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { studentId, name, password } = req.body;
  if (!studentId || !name || !password)
    return res.status(400).json({ error: 'studentId, name, and password required' });

  const existing = await Student.findOne({ studentId });
  if (existing) return res.status(409).json({ error: 'Student ID already exists' });

  const passwordHash = await bcrypt.hash(password, 10);
  const student = await Student.create({ studentId, name, passwordHash });

  res.status(201).json({
    id: student._id,
    studentId: student.studentId,
    name: student.name,
    examCompleted: student.examCompleted,
  });
});

// Delete student
router.delete('/students/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  await Student.findByIdAndDelete(req.params.id);
  await Answer.deleteMany({ studentId: req.params.id });
  res.json({ message: 'Student deleted' });
});

// Get student's answers with question details
router.get('/students/:id/answers', requireAdmin, async (req: AuthRequest, res: Response) => {
  const student = await Student.findById(req.params.id).select('-passwordHash');
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const questions = await Question.find().sort({ order: 1 });
  const answers = await Answer.find({ studentId: req.params.id });

  const answerMap = new Map(answers.map((a) => [a.questionId.toString(), a]));

  const result = questions.map((q) => {
    const ans = answerMap.get(q._id.toString());
    return {
      question: { id: q._id, text: q.text, type: q.type, options: q.options, maxMarks: q.maxMarks, order: q.order },
      answer: ans?.answer ?? '',
      savedAt: ans?.savedAt ?? null,
      marksAwarded: ans?.marksAwarded ?? null,
      feedback: ans?.feedback ?? null,
      answerId: ans?._id ?? null,
    };
  });

  res.json({ student, answers: result });
});

// Grade student: save marks per answer
router.post('/students/:id/grade', requireAdmin, async (req: AuthRequest, res: Response) => {
  // grades: [{ questionId, marksAwarded, feedback }]
  const { grades } = req.body;
  if (!Array.isArray(grades)) return res.status(400).json({ error: 'grades array required' });

  await Promise.all(
    grades.map(({ questionId, marksAwarded, feedback }: { questionId: string; marksAwarded: number; feedback: string }) =>
      Answer.findOneAndUpdate(
        { studentId: req.params.id, questionId },
        { marksAwarded, feedback },
        { upsert: true }
      )
    )
  );

  res.json({ message: 'Grades saved' });
});

// ── Questions ──────────────────────────────────────────────────────────────────

// List questions
router.get('/questions', requireAdmin, async (_req: AuthRequest, res: Response) => {
  const questions = await Question.find().sort({ order: 1 }).select('-__v');
  res.json(questions);
});

// Create question
router.post('/questions', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { text, type, options, maxMarks } = req.body;
  if (!text || !type) return res.status(400).json({ error: 'text and type required' });

  const count = await Question.countDocuments();
  const question = await Question.create({
    text,
    type,
    options: options || [],
    maxMarks: maxMarks || 10,
    order: count + 1,
  });

  res.status(201).json(question);
});

// Update question
router.put('/questions/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { text, type, options, maxMarks, order } = req.body;
  const question = await Question.findByIdAndUpdate(
    req.params.id,
    { text, type, options, maxMarks, order },
    { new: true }
  );
  if (!question) return res.status(404).json({ error: 'Question not found' });
  res.json(question);
});

// Delete question
router.delete('/questions/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  await Question.findByIdAndDelete(req.params.id);
  res.json({ message: 'Question deleted' });
});

export default router;
