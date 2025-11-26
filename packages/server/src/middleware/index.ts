/**
 * Consolidated middleware for the ElizaOS server
 * All middleware is organized into logical modules for better maintainability
 */

// Authentication middleware
export { apiKeyAuthMiddleware } from './auth';

// Session middleware
export { sessionMiddleware, createSession, getSessionUser, deleteSession } from './session';

// Security middleware
export { securityMiddleware } from './security';

// Rate limiting middleware
export {
  createApiRateLimit,
  createFileSystemRateLimit,
  createUploadRateLimit,
  createChannelValidationRateLimit,
} from './rate-limit';

// Validation middleware
export {
  agentExistsMiddleware,
  validateUuidMiddleware,
  validateChannelIdMiddleware,
  validateContentTypeMiddleware,
} from './validation';
