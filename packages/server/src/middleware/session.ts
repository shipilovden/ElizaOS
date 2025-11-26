import crypto from 'node:crypto';
import { type Request, type Response, type NextFunction } from 'express';
import { logger } from '@elizaos/core';
import type { SessionUser } from '../types/telegram';

/**
 * In-memory session storage
 * In production, consider using Redis or database
 */
const sessions = new Map<string, SessionUser>();

/**
 * Session configuration
 */
const SESSION_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Cleanup expired sessions periodically
 */
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [sessionId, session] of sessions.entries()) {
    const sessionAge = now - session.lastActivity.getTime();
    if (sessionAge > SESSION_TIMEOUT_MS) {
      sessions.delete(sessionId);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    logger.debug(`[Session] Cleaned up ${cleaned} expired sessions`);
  }
}, CLEANUP_INTERVAL_MS);

/**
 * Creates a new user session
 */
export function createSession(user: Omit<SessionUser, 'sessionId' | 'createdAt' | 'lastActivity'>): string {
  const sessionId = generateSessionId();
  const now = new Date();
  
  const session: SessionUser = {
    ...user,
    sessionId,
    createdAt: now,
    lastActivity: now,
  };
  
  sessions.set(sessionId, session);
  logger.debug(`[Session] Created session ${sessionId} for user ${user.telegramId}`);
  
  return sessionId;
}

/**
 * Gets user from session
 */
export function getSessionUser(sessionId: string): SessionUser | null {
  const session = sessions.get(sessionId);
  
  if (!session) {
    return null;
  }
  
  // Check if session expired
  const now = Date.now();
  const sessionAge = now - session.lastActivity.getTime();
  
  if (sessionAge > SESSION_TIMEOUT_MS) {
    sessions.delete(sessionId);
    return null;
  }
  
  // Update last activity
  session.lastActivity = new Date();
  
  return session;
}

/**
 * Deletes a session
 */
export function deleteSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

/**
 * Generates a secure random session ID
 */
function generateSessionId(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Express middleware to extract and validate session
 * Adds req.sessionUser if valid session found
 */
export function sessionMiddleware(
  req: Request & { sessionUser?: SessionUser },
  res: Response,
  next: NextFunction
): void {
  // Get session ID from cookie or Authorization header
  const sessionId = 
    req.cookies?.sessionId || 
    req.headers.authorization?.replace('Bearer ', '') ||
    req.headers['x-session-id'] as string;
  
  if (sessionId) {
    const user = getSessionUser(sessionId);
    if (user) {
      req.sessionUser = user;
    }
  }
  
  next();
}

