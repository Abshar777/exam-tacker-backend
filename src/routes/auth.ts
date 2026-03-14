import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { Student } from '../models/Student';
import { Admin } from '../models/Admin';
import { signToken } from '../middleware/auth';

const router = Router();

// Student login
router.post('/student/login', async (req: Request, res: Response) => {
  const { studentId, password } = req.body;
  if (!studentId || !password)
    return res.status(400).json({ error: 'studentId and password required' });

  const student = await Student.findOne({ studentId });
  if (!student) return res.status(401).json({ error: 'Invalid credentials' });

  const match = await bcrypt.compare(password, student.passwordHash);
  if (!match) return res.status(401).json({ error: 'Invalid credentials' });

  // Completed students can re-login to view grades — issue a long-lived read-only token
  if (student.examCompleted) {
    const token = signToken(student._id.toString(), 'student', '30d');
    return res.json({
      token,
      student: {
        id: student._id,
        name: student.name,
        studentId: student.studentId,
        examCompleted: true,
        suspendedReason: student.suspendedReason ?? null,
      },
    });
  }

  const token = signToken(student._id.toString(), 'student');
  res.json({
    token,
    student: {
      id: student._id,
      name: student.name,
      studentId: student.studentId,
      examCompleted: false,
      examStartedAt: student.examStartedAt,
    },
  });
});

// Admin login
router.post('/admin/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'username and password required' });

  const admin = await Admin.findOne({ username });
  if (!admin) return res.status(401).json({ error: 'Invalid credentials' });

  const match = await bcrypt.compare(password, admin.passwordHash);
  if (!match) return res.status(401).json({ error: 'Invalid credentials' });

  const token = signToken(admin._id.toString(), 'admin');
  res.json({ token, admin: { id: admin._id, username: admin.username } });
});

export default router;
