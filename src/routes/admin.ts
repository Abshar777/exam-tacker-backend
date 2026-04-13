import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { requireAdmin, AuthRequest } from '../middleware/auth';
import { Exam } from '../models/Exam';
import { Student } from '../models/Student';
import { Question } from '../models/Question';
import { Answer } from '../models/Answer';
import { ExamLog } from '../models/ExamLog';

const router = Router();

// ── Exams ─────────────────────────────────────────────────────────────────────

// List all exams (with student + question counts)
router.get('/exams', requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const exams = await Exam.find().sort({ createdAt: -1 }).lean();
    const enriched = await Promise.all(
      exams.map(async (exam) => {
        const [studentCount, questionCount] = await Promise.all([
          Student.countDocuments({ examId: exam._id }),
          Question.countDocuments({ examId: exam._id }),
        ]);
        return { ...exam, studentCount, questionCount };
      })
    );
    res.json(enriched);
  } catch (err) {
    console.error('GET /exams', err);
    res.status(500).json({ error: 'Failed to fetch exams' });
  }
});

// Get single exam
router.get('/exams/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id))
      return res.status(400).json({ error: 'Invalid exam id' });
    const exam = await Exam.findById(req.params.id).lean();
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    res.json(exam);
  } catch (err) {
    console.error('GET /exams/:id', err);
    res.status(500).json({ error: 'Failed to fetch exam' });
  }
});

// Create exam
router.post('/exams', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, durationMinutes } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const exam = await Exam.create({
      name,
      description: description || '',
      durationMinutes: Number(durationMinutes) || 70,
    });
    res.status(201).json(exam);
  } catch (err) {
    console.error('POST /exams', err);
    res.status(500).json({ error: 'Failed to create exam' });
  }
});

// Update exam
router.put('/exams/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, durationMinutes } = req.body;
    const exam = await Exam.findByIdAndUpdate(
      req.params.id,
      { name, description, durationMinutes: Number(durationMinutes) },
      { new: true }
    );
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    res.json(exam);
  } catch (err) {
    console.error('PUT /exams/:id', err);
    res.status(500).json({ error: 'Failed to update exam' });
  }
});

// Delete exam — cascades everything
router.delete('/exams/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const students = await Student.find({ examId: id }).select('_id').lean();
    const studentIds = students.map((s) => s._id);

    await Promise.all([
      Student.deleteMany({ examId: id }),
      Question.deleteMany({ examId: id }),
      Answer.deleteMany({ examId: id }),
      ExamLog.deleteMany({ examId: id }),
      studentIds.length > 0 ? Answer.deleteMany({ studentId: { $in: studentIds } }) : Promise.resolve(),
      studentIds.length > 0 ? ExamLog.deleteMany({ studentId: { $in: studentIds } }) : Promise.resolve(),
    ]);

    await Exam.findByIdAndDelete(id);
    res.json({ message: 'Exam deleted' });
  } catch (err) {
    console.error('DELETE /exams/:id', err);
    res.status(500).json({ error: 'Failed to delete exam' });
  }
});

// ── Students ──────────────────────────────────────────────────────────────────

// List students for an exam (includes plain password + grade totals)
router.get('/exams/:examId/students', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { examId } = req.params;

    const [students, questions] = await Promise.all([
      Student.find({ examId })
        .select('studentId name password examStartedAt examSubmittedAt examCompleted suspendedReason createdAt')
        .sort({ createdAt: -1 })
        .lean(),
      Question.find({ examId }).select('maxMarks').lean(),
    ]);

    const totalPossible = questions.reduce((s, q) => s + q.maxMarks, 0);

    const enriched = await Promise.all(
      students.map(async (student) => {
        const answers = await Answer.find({ studentId: student._id }).select('marksAwarded').lean();
        const isGraded = answers.some((a) => a.marksAwarded !== null);
        const totalAwarded = answers.reduce((s, a) => s + (a.marksAwarded ?? 0), 0);
        return { ...student, totalAwarded, totalPossible, isGraded };
      })
    );

    res.json(enriched);
  } catch (err) {
    console.error('GET /exams/:examId/students', err);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// Create student enrolled in an exam
router.post('/exams/:examId/students', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { studentId, name, password } = req.body;
    if (!studentId || !name || !password)
      return res.status(400).json({ error: 'studentId, name, and password required' });

    const exam = await Exam.findById(req.params.examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    const existing = await Student.findOne({ studentId });
    if (existing) return res.status(409).json({ error: 'Student ID already exists' });

    const student = await Student.create({
      studentId,
      name,
      password,
      examId: req.params.examId,
    });

    res.status(201).json({
      _id: student._id,
      studentId: student.studentId,
      name: student.name,
      examCompleted: student.examCompleted,
    });
  } catch (err) {
    console.error('POST /exams/:examId/students', err);
    res.status(500).json({ error: 'Failed to create student' });
  }
});

// Edit student (name, studentId, password)
router.put('/students/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { studentId, name, password } = req.body;
    if (!studentId || !name || !password)
      return res.status(400).json({ error: 'studentId, name, and password required' });

    // Check for duplicate studentId (exclude self)
    const conflict = await Student.findOne({ studentId, _id: { $ne: req.params.id } });
    if (conflict) return res.status(409).json({ error: 'Student ID already taken by another student' });

    const student = await Student.findByIdAndUpdate(
      req.params.id,
      { studentId, name, password },
      { new: true }
    ).select('studentId name password examCompleted');

    if (!student) return res.status(404).json({ error: 'Student not found' });
    res.json(student);
  } catch (err) {
    console.error('PUT /students/:id', err);
    res.status(500).json({ error: 'Failed to update student' });
  }
});

// Delete student
router.delete('/students/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    await Student.findByIdAndDelete(req.params.id);
    await Answer.deleteMany({ studentId: req.params.id });
    await ExamLog.deleteMany({ studentId: req.params.id });
    res.json({ message: 'Student deleted' });
  } catch (err) {
    console.error('DELETE /students/:id', err);
    res.status(500).json({ error: 'Failed to delete student' });
  }
});

// Get student's answers with question details
router.get('/students/:id/answers', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const student = await Student.findById(req.params.id)
      .select('studentId name examStartedAt examSubmittedAt examCompleted suspendedReason examId createdAt')
      .lean();
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const questions = await Question.find({ examId: student.examId }).sort({ order: 1 });
    const answers = await Answer.find({ studentId: req.params.id });

    const answerMap = new Map(answers.map((a) => [a.questionId.toString(), a]));

    const result = questions.map((q) => {
      const ans = answerMap.get(q._id.toString());
      return {
        question: {
          id: q._id,
          text: q.text,
          type: q.type,
          options: q.options,
          maxMarks: q.maxMarks,
          order: q.order,
        },
        answer: ans?.answer ?? '',
        savedAt: ans?.savedAt ?? null,
        marksAwarded: ans?.marksAwarded ?? null,
        feedback: ans?.feedback ?? null,
        answerId: ans?._id ?? null,
      };
    });

    res.json({ student, answers: result });
  } catch (err) {
    console.error('GET /students/:id/answers', err);
    res.status(500).json({ error: 'Failed to fetch answers' });
  }
});

// Grade student answers
router.post('/students/:id/grade', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { grades } = req.body;
    if (!Array.isArray(grades)) return res.status(400).json({ error: 'grades array required' });

    await Promise.all(
      grades.map(
        ({ questionId, marksAwarded, feedback }: { questionId: string; marksAwarded: number; feedback: string }) =>
          Answer.findOneAndUpdate(
            { studentId: req.params.id, questionId },
            { marksAwarded, feedback },
            { upsert: true }
          )
      )
    );

    res.json({ message: 'Grades saved' });
  } catch (err) {
    console.error('POST /students/:id/grade', err);
    res.status(500).json({ error: 'Failed to save grades' });
  }
});

// Get exam activity logs for a student
router.get('/students/:id/logs', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const logs = await ExamLog.find({ studentId: req.params.id }).sort({ timestamp: 1 }).lean();
    res.json(logs);
  } catch (err) {
    console.error('GET /students/:id/logs', err);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// ── Questions ──────────────────────────────────────────────────────────────────

// List questions for an exam
router.get('/exams/:examId/questions', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const questions = await Question.find({ examId: req.params.examId })
      .sort({ order: 1 })
      .select('-__v');
    res.json(questions);
  } catch (err) {
    console.error('GET /exams/:examId/questions', err);
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
});

// Create question for an exam
router.post('/exams/:examId/questions', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { text, type, options, maxMarks } = req.body;
    if (!text || !type) return res.status(400).json({ error: 'text and type required' });

    const exam = await Exam.findById(req.params.examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    const count = await Question.countDocuments({ examId: req.params.examId });
    const question = await Question.create({
      text,
      type,
      options: options || [],
      maxMarks: Number(maxMarks) || 10,
      order: count + 1,
      examId: req.params.examId,
    });

    res.status(201).json(question);
  } catch (err) {
    console.error('POST /exams/:examId/questions', err);
    res.status(500).json({ error: 'Failed to create question' });
  }
});

// Reorder questions — body: { ids: [id1, id2, ...] } in new order
router.put('/exams/:examId/questions/reorder', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { ids } = req.body as { ids: string[] };
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });

    await Promise.all(
      ids.map((id, index) =>
        Question.findByIdAndUpdate(id, { order: index + 1 })
      )
    );
    res.json({ message: 'Order saved' });
  } catch (err) {
    console.error('PUT /exams/:examId/questions/reorder', err);
    res.status(500).json({ error: 'Failed to reorder questions' });
  }
});

// Update question
router.put('/questions/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { text, type, options, maxMarks, order } = req.body;
    const question = await Question.findByIdAndUpdate(
      req.params.id,
      { text, type, options, maxMarks: Number(maxMarks), order },
      { new: true }
    );
    if (!question) return res.status(404).json({ error: 'Question not found' });
    res.json(question);
  } catch (err) {
    console.error('PUT /questions/:id', err);
    res.status(500).json({ error: 'Failed to update question' });
  }
});

// Delete question
router.delete('/questions/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    await Question.findByIdAndDelete(req.params.id);
    res.json({ message: 'Question deleted' });
  } catch (err) {
    console.error('DELETE /questions/:id', err);
    res.status(500).json({ error: 'Failed to delete question' });
  }
});

export default router;
