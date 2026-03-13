import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'tlogic-secret-key-2024';

export interface AuthRequest extends Request {
  user?: { id: string; role: 'student' | 'admin' };
}

export function requireStudent(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; role: string };
    if (decoded.role !== 'student') return res.status(403).json({ error: 'Forbidden' });
    req.user = { id: decoded.id, role: 'student' };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];
  console.log(token);
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    console.log(token,"done");
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; role: string };
    console.log(decoded,"decoded");
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    console.log(decoded.id,"decoded");
    req.user = { id: decoded.id, role: 'admin' };
    console.log(req.user,"req.user");
    next();
  } catch (error) {
    console.log(error);
    res.status(401).json({ error: 'Invalid token' });
  }
}

export function signToken(id: string, role: 'student' | 'admin') {
  const expiresIn = role === 'admin' ? '8h' : '2h';
  return jwt.sign({ id, role }, JWT_SECRET, { expiresIn });
}
