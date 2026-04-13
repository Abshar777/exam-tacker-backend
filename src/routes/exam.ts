import { Router, Response } from 'express';
import { requireStudent, AuthRequest } from '../middleware/auth';
import { Exam } from '../models/Exam';
import { Question } from '../models/Question';
import { Answer } from '../models/Answer';
import { Student } from '../models/Student';
import { ExamLog } from '../models/ExamLog';

const router = Router();

// Helper: resolve exam duration in ms for a student
async function getExamDurationMs(examId: unknown): Promise<number> {
  if (examId) {
    try {
      const exam = await Exam.findById(examId).select('durationMinutes').lean();
      if (exam && typeof (exam as { durationMinutes?: number }).durationMinutes === 'number') {
        return (exam as { durationMinutes: number }).durationMinutes * 60 * 1000;
      }
    } catch { /* fall through to default */ }
  }
  return 70 * 60 * 1000; // fallback for legacy students without examId
}

// ── POST /exam/start ──────────────────────────────────────────────────────────
router.post('/start', requireStudent, async (req: AuthRequest, res: Response) => {
  try {
    const student = await Student.findById(req.user!.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    if (student.examCompleted) return res.status(403).json({ error: 'Exam already submitted' });

    if (!student.examStartedAt) {
      student.examStartedAt = new Date();
      await student.save();
    }

    const durationMs = await getExamDurationMs(student.examId);
    res.json({ examStartedAt: student.examStartedAt, durationMs });
  } catch (err) {
    console.error('POST /exam/start', err);
    res.status(500).json({ error: 'Failed to start exam' });
  }
});

// ── GET /exam/questions ───────────────────────────────────────────────────────
router.get('/questions', requireStudent, async (req: AuthRequest, res: Response) => {
  try {
    const student = await Student.findById(req.user!.id).select('examId').lean();
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const examId = (student as { examId?: unknown }).examId;
    const questions = await Question.find({ examId }).sort({ order: 1 }).select('-__v');
    res.json(questions);
  } catch (err) {
    console.error('GET /exam/questions', err);
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
});

// ── GET /exam/status ──────────────────────────────────────────────────────────
router.get('/status', requireStudent, async (req: AuthRequest, res: Response) => {
  try {
    const student = await Student.findById(req.user!.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    if (student.examCompleted)
      return res.json({ completed: true, timeRemainingMs: 0, durationMs: 0, answers: [] });

    const durationMs = await getExamDurationMs(student.examId);
    const elapsed = student.examStartedAt ? Date.now() - student.examStartedAt.getTime() : 0;
    const timeRemainingMs = Math.max(0, durationMs - elapsed);

    const answers = await Answer.find({ studentId: req.user!.id });

    res.json({
      completed: false,
      examStartedAt: student.examStartedAt,
      timeRemainingMs,
      durationMs,
      answers: answers.map((a) => ({
        questionId: a.questionId,
        answer: a.answer,
        savedAt: a.savedAt,
      })),
    });
  } catch (err) {
    console.error('GET /exam/status', err);
    res.status(500).json({ error: 'Failed to fetch exam status' });
  }
});

// ── POST /exam/answer ─────────────────────────────────────────────────────────
router.post('/answer', requireStudent, async (req: AuthRequest, res: Response) => {
  try {
    const { questionId, answer } = req.body;
    if (!questionId) return res.status(400).json({ error: 'questionId required' });

    const student = await Student.findById(req.user!.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    if (student.examCompleted) return res.status(403).json({ error: 'Exam already submitted' });

    if (student.examStartedAt) {
      const durationMs = await getExamDurationMs(student.examId);
      const elapsed = Date.now() - student.examStartedAt.getTime();
      if (elapsed >= durationMs) {
        student.examCompleted = true;
        student.examSubmittedAt = new Date();
        await student.save();
        return res.status(403).json({ error: 'Time expired. Exam submitted.' });
      }
    }

    await Answer.findOneAndUpdate(
      { studentId: req.user!.id, questionId },
      { answer, savedAt: new Date(), examId: student.examId },
      { upsert: true, new: true }
    );

    res.json({ saved: true });
  } catch (err) {
    console.error('POST /exam/answer', err);
    res.status(500).json({ error: 'Failed to save answer' });
  }
});

// ── GET /exam/grades ──────────────────────────────────────────────────────────
router.get('/grades', requireStudent, async (req: AuthRequest, res: Response) => {
  try {
    const student = await Student.findById(req.user!.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    if (!student.examCompleted) return res.status(403).json({ error: 'Exam not yet submitted' });

    const questions = await Question.find({ examId: student.examId }).sort({ order: 1 });
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
      suspendedReason: student.suspendedReason ?? null,
      results,
    });
  } catch (err) {
    console.error('GET /exam/grades', err);
    res.status(500).json({ error: 'Failed to fetch grades' });
  }
});

// ── POST /exam/submit ─────────────────────────────────────────────────────────
router.post('/submit', requireStudent, async (req: AuthRequest, res: Response) => {
  try {
    const { reason } = req.body as { reason?: string };

    const student = await Student.findById(req.user!.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    if (student.examCompleted) return res.status(400).json({ error: 'Exam already submitted' });

    student.examCompleted = true;
    student.examSubmittedAt = new Date();
    if (reason) student.suspendedReason = reason;
    await student.save();

    res.json({
      message: reason ? 'Exam suspended and submitted' : 'Exam submitted successfully',
      submittedAt: student.examSubmittedAt,
      suspended: !!reason,
    });
  } catch (err) {
    console.error('POST /exam/submit', err);
    res.status(500).json({ error: 'Failed to submit exam' });
  }
});

// ── POST /exam/log ────────────────────────────────────────────────────────────
router.post('/log', requireStudent, async (req: AuthRequest, res: Response) => {
  try {
    const { event, detail } = req.body;
    if (!event) return res.status(400).json({ error: 'event required' });

    const student = await Student.findById(req.user!.id).select('examId').lean();
    const examId = student ? (student as { examId?: unknown }).examId : null;

    await ExamLog.create({
      studentId: req.user!.id,
      event,
      detail: detail || null,
      timestamp: new Date(),
      examId: examId ?? null,
    });

    res.json({ logged: true });
  } catch (err) {
    console.error('POST /exam/log', err);
    res.status(500).json({ error: 'Failed to log event' });
  }
});

export default router;
