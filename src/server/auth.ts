import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db.ts';
import type { UserProfile } from '../shared/types.ts';

interface SessionRecord {
  userId: string;
  expiresAt: number;
}

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const sessions = new Map<string, SessionRecord>();

export interface AuthRequest extends Request {
  user?: UserProfile;
  token?: string;
}

export function getProfileById(userId: string): UserProfile | null {
  const row = db
    .prepare(
      `
      SELECT
        p.id, p.email, p.full_name, p.role, p.ward_id, p.department_id,
        p.phone_masked, p.avatar_initials, p.is_demo,
        w.name AS ward_name,
        d.name AS department_name
      FROM profiles p
      LEFT JOIN wards w ON w.id = p.ward_id
      LEFT JOIN departments d ON d.id = p.department_id
      WHERE p.id = ?
    `
    )
    .get(userId) as Record<string, unknown> | undefined;

  if (!row) return null;
  return {
    id: String(row.id),
    email: String(row.email),
    fullName: String(row.full_name),
    role: row.role as UserProfile['role'],
    wardId: row.ward_id ? String(row.ward_id) : null,
    wardName: row.ward_name ? String(row.ward_name) : null,
    departmentId: row.department_id ? String(row.department_id) : null,
    departmentName: row.department_name ? String(row.department_name) : null,
    phoneMasked: row.phone_masked ? String(row.phone_masked) : null,
    avatarInitials: String(row.avatar_initials),
    isDemo: Boolean(row.is_demo),
  };
}

export function createSession(userId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, {
    userId,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return token;
}

export function revokeSession(token: string) {
  sessions.delete(token);
}

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const token = extractBearer(req);
  if (token) {
    const rec = sessions.get(token);
    if (rec && rec.expiresAt > Date.now()) {
      const profile = getProfileById(rec.userId);
      if (profile) {
        req.user = profile;
        req.token = token;
      }
    } else if (rec) {
      sessions.delete(token);
    }
  }
  next();
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = extractBearer(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }
  const rec = sessions.get(token);
  if (!rec || rec.expiresAt <= Date.now()) {
    if (rec) sessions.delete(token);
    return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
  const profile = getProfileById(rec.userId);
  if (!profile) {
    return res.status(401).json({ error: 'Account not found.' });
  }
  req.user = profile;
  req.token = token;
  next();
}

export function requireRole(...allowedRoles: Array<UserProfile['role']>) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access restricted. Required role: ${allowedRoles.join(' or ')}.`,
      });
    }
    next();
  };
}
