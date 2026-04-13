import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { Student } from '../models/Student';
import { Admin } from '../models/Admin';
import { signToken } from '../middleware/auth';

const router = Router();

// Student login — plain text password
router.post('/student/login', async (req: Request, res: Response) => {
  try {
    const { studentId, password } = req.body;
    if (!studentId || !password)
      return res.status(400).json({ error: 'studentId and password required' });

    const student = await Student.findOne({ studentId });
    if (!student) return res.status(401).json({ error: 'Invalid credentials' });

    if (student.password !== password)
      return res.status(401).json({ error: 'Invalid credentials' });

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
  } catch (err) {
    console.error('POST /auth/student/login', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Admin login — bcrypt
router.post('/admin/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'username and password required' });

    const admin = await Admin.findOne({ username });
    if (!admin) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, admin.passwordHash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken(admin._id.toString(), 'admin');
    res.json({ token, admin: { id: admin._id, username: admin.username } });
  } catch (err) {
    console.error('POST /auth/admin/login', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

export default router;
