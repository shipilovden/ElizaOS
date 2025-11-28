import express from 'express';
import { logger } from '@elizaos/core';
import type { DatabaseAdapter } from '@elizaos/core';
import { validateTelegramAuth, convertToTelegramUser } from './telegram';
import { createSession, getSessionUser, deleteSession, getSessionByTelegramId, getSessionByAuthToken, initializeSessionStorage } from '../../middleware/session';
import type { TelegramAuthData, TelegramUser } from '../../types/telegram';

/**
 * Creates the authentication router
 */
export function authRouter(database?: DatabaseAdapter): express.Router {
  const router = express.Router();

  logger.info('[Auth] Initializing auth router', { hasDatabase: !!database });

  // Initialize session storage with database if provided
  if (database) {
    initializeSessionStorage(database);
    logger.info('[Auth] Session storage initialized with database');
  } else {
    logger.warn('[Auth] No database provided, using in-memory session storage');
  }

  // Log all registered routes for debugging
  logger.info('[Auth] Registering routes: /telegram/login, /telegram/check, /telegram/bot/login, /telegram/bot/user-info, /me, /logout');

  /**
   * POST /api/auth/telegram/login
   * Validates Telegram authentication data and creates a session
   */
  router.post('/telegram/login', async (req: express.Request, res: express.Response) => {
    try {
      // Use TELEGRAM_BOT_TOKEN (same token can be used for both web auth and bot)
      const botToken = process.env.TELEGRAM_BOT_TOKEN;

      if (!botToken) {
        logger.error('[Auth] AICHAT_TELEGRAM_BOT_TOKEN / TELEGRAM_BOT_TOKEN not configured');
        return res.status(500).json({ 
          error: 'Telegram authentication not configured' 
        });
      }

      const authData = req.body as TelegramAuthData;

      // Validate required fields
      if (!authData.id || !authData.first_name || !authData.auth_date || !authData.hash) {
        return res.status(400).json({ 
          error: 'Missing required authentication fields' 
        });
      }

      // Validate Telegram auth data
      const isValid = validateTelegramAuth(authData, botToken);
      
      if (!isValid) {
        logger.warn(`[Auth] Invalid Telegram auth data from user ${authData.id}`);
        return res.status(401).json({ 
          error: 'Invalid authentication data' 
        });
      }

      // Convert to TelegramUser
      const telegramUser = convertToTelegramUser(authData);

      // Create session
      const sessionId = await createSession({
        telegramId: telegramUser.id,
        firstName: telegramUser.firstName,
        lastName: telegramUser.lastName,
        username: telegramUser.username,
        photoUrl: telegramUser.photoUrl,
      });

      logger.info(`[Auth] User ${telegramUser.id} (${telegramUser.firstName}) logged in`);

      // Return user data and session ID
      res.json({
        user: telegramUser,
        sessionId,
      });
    } catch (error) {
      logger.error('[Auth] Login error:', error);
      res.status(500).json({ 
        error: 'Internal server error during authentication' 
      });
    }
  });

  /**
   * GET /api/auth/telegram/bot/user-info
   * Returns user info by Telegram ID (for bot commands)
   */
  router.get('/telegram/bot/user-info', async (req: express.Request, res: express.Response) => {
    const telegramId = req.query.telegramId;
    
    if (!telegramId) {
      return res.status(400).json({ 
        error: 'telegramId query parameter is required' 
      });
    }
    
    const telegramIdNum = Number.parseInt(telegramId as string, 10);
    if (Number.isNaN(telegramIdNum)) {
      return res.status(400).json({ 
        error: 'Invalid telegramId format' 
      });
    }
    
    const sessionUser = await getSessionByTelegramId(telegramIdNum);
    
    if (!sessionUser) {
      return res.status(404).json({ 
        error: 'User not found or not logged in' 
      });
    }
    
    // Return user data
    const user: TelegramUser = {
      id: sessionUser.telegramId,
      firstName: sessionUser.firstName,
      lastName: sessionUser.lastName,
      username: sessionUser.username,
      photoUrl: sessionUser.photoUrl,
    };
    
    res.json({ 
      user,
      sessionId: sessionUser.sessionId,
      createdAt: sessionUser.createdAt,
      lastActivity: sessionUser.lastActivity,
    });
  });

  /**
   * GET /api/auth/me
   * Returns current authenticated user
   */
  router.get('/me', async (req: express.Request & { sessionUser?: any }, res: express.Response) => {
    const sessionId = 
      req.headers.authorization?.replace('Bearer ', '') ||
      req.headers['x-session-id'] as string ||
      req.query.sessionId as string;

    if (!sessionId) {
      return res.status(401).json({ 
        error: 'No session provided' 
      });
    }

    const sessionUser = await getSessionUser(sessionId);

    if (!sessionUser) {
      return res.status(401).json({ 
        error: 'Invalid or expired session' 
      });
    }

    // Return user data without sensitive info
    const user: TelegramUser = {
      id: sessionUser.telegramId,
      firstName: sessionUser.firstName,
      lastName: sessionUser.lastName,
      username: sessionUser.username,
      photoUrl: sessionUser.photoUrl,
    };

    res.json({ 
      user, 
      sessionId: sessionUser.sessionId,
      createdAt: sessionUser.createdAt,
      lastActivity: sessionUser.lastActivity,
    });
  });

  /**
   * GET /api/auth/telegram/callback
   * Callback endpoint for Telegram Login Widget
   * Telegram widget sends data as query parameters
   */
  router.get('/telegram/callback', async (req: express.Request, res: express.Response) => {
    try {
      // Use TELEGRAM_BOT_TOKEN (same token can be used for both web auth and bot)
      const botToken = process.env.TELEGRAM_BOT_TOKEN;

      if (!botToken) {
        logger.error('[Auth] AICHAT_TELEGRAM_BOT_TOKEN / TELEGRAM_BOT_TOKEN not configured');
        return res.status(500).send(`
          <html>
            <body>
              <h1>Authentication Error</h1>
              <p>Telegram authentication is not configured on the server.</p>
              <script>
                window.opener?.postMessage({ error: 'Authentication not configured' }, '*');
                window.close();
              </script>
            </body>
          </html>
        `);
      }

      // Telegram sends data as query parameters
      const authData: TelegramAuthData = {
        id: Number.parseInt(req.query.id as string, 10),
        first_name: req.query.first_name as string,
        last_name: req.query.last_name as string | undefined,
        username: req.query.username as string | undefined,
        photo_url: req.query.photo_url as string | undefined,
        auth_date: Number.parseInt(req.query.auth_date as string, 10),
        hash: req.query.hash as string,
      };

      // Validate required fields
      if (!authData.id || !authData.first_name || !authData.auth_date || !authData.hash) {
        return res.status(400).send(`
          <html>
            <body>
              <h1>Authentication Error</h1>
              <p>Missing required authentication fields.</p>
              <script>
                window.opener?.postMessage({ error: 'Missing required fields' }, '*');
                window.close();
              </script>
            </body>
          </html>
        `);
      }

      // Validate Telegram auth data
      const isValid = validateTelegramAuth(authData, botToken);
      
      if (!isValid) {
        logger.warn(`[Auth] Invalid Telegram auth data from user ${authData.id}`);
        return res.status(401).send(`
          <html>
            <body>
              <h1>Authentication Failed</h1>
              <p>Invalid authentication data.</p>
              <script>
                window.opener?.postMessage({ error: 'Invalid authentication data' }, '*');
                window.close();
              </script>
            </body>
          </html>
        `);
      }

      // Convert to TelegramUser
      const telegramUser = convertToTelegramUser(authData);

      // Create session
      const sessionId = await createSession({
        telegramId: telegramUser.id,
        firstName: telegramUser.firstName,
        lastName: telegramUser.lastName,
        username: telegramUser.username,
        photoUrl: telegramUser.photoUrl,
      });

      logger.info(`[Auth] User ${telegramUser.id} (${telegramUser.firstName}) logged in via callback`);

      // Return HTML page that sends message to opener window
      // Try multiple methods to ensure message is received
      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Authentication Successful</title>
            <meta charset="UTF-8">
          </head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h1>✅ Authentication Successful</h1>
            <p>You can close this window.</p>
            <p style="color: #666; font-size: 12px;">This window will close automatically...</p>
            <script>
              (function() {
                const userData = ${JSON.stringify(telegramUser)};
                const sessionId = '${sessionId}';
                const message = {
                  type: 'telegram-auth-success',
                  user: userData,
                  sessionId: sessionId
                };
                
                console.log('Sending auth success message', message);
                
                // Try to send message to opener
                if (window.opener && !window.opener.closed) {
                  try {
                    window.opener.postMessage(message, window.location.origin);
                    console.log('Message sent to opener');
                  } catch (e) {
                    console.error('Error sending message to opener:', e);
                  }
                }
                
                // Also try to send to parent (if in iframe)
                if (window.parent !== window) {
                  try {
                    window.parent.postMessage(message, window.location.origin);
                    console.log('Message sent to parent');
                  } catch (e) {
                    console.error('Error sending message to parent:', e);
                  }
                }
                
                // Store in localStorage as fallback (for opener window)
                // Note: This will only work if callback opens in same origin
                // For cross-window communication, we rely on postMessage
                try {
                  // Try to access opener's localStorage
                  if (window.opener && !window.opener.closed) {
                    try {
                      window.opener.localStorage.setItem('telegram-auth-success', JSON.stringify(message));
                      console.log('Message stored in opener localStorage');
                    } catch (e) {
                      console.warn('Cannot access opener localStorage (cross-origin)', e);
                    }
                  }
                  // Also store in current window (in case callback is in same window)
                  localStorage.setItem('telegram-auth-success', JSON.stringify(message));
                  console.log('Message stored in current localStorage');
                } catch (e) {
                  console.error('Error storing in localStorage:', e);
                }
                
                // Close window after a delay (only if opened as popup)
                // Give time for postMessage to be received
                setTimeout(function() {
                  // Only close if we have an opener (popup window)
                  if (window.opener && !window.opener.closed) {
                    window.close();
                  } else {
                    // If no opener, redirect to main page
                    window.location.href = window.location.origin;
                  }
                }, 3000);
              })();
            </script>
          </body>
        </html>
      `);
    } catch (error) {
      logger.error('[Auth] Callback error:', error);
      res.status(500).send(`
        <html>
          <body>
            <h1>Authentication Error</h1>
            <p>An error occurred during authentication.</p>
            <script>
              window.opener?.postMessage({ error: 'Internal server error' }, '*');
              window.close();
            </script>
          </body>
        </html>
      `);
    }
  });

  /**
   * GET /api/auth/telegram/check
   * Checks if authentication token has been used to create a session
   * Used for polling from client when user authenticates via bot
   */
  router.get('/telegram/check', async (req: express.Request, res: express.Response) => {
    logger.info('[Auth] GET /telegram/check called', { 
      token: req.query.token ? 'present' : 'missing',
      query: req.query 
    });

    const token = req.query.token as string;

    if (!token) {
      logger.warn('[Auth] /telegram/check called without token');
      return res.status(400).json({
        error: 'Token is required'
      });
    }

    try {
      // Find session by auth token
      const session = await getSessionByAuthToken(token);

      if (session) {
        logger.info('[Auth] Session found for token', { 
          telegramId: session.telegramId,
          sessionId: session.sessionId 
        });

        const user: TelegramUser = {
          id: session.telegramId,
          firstName: session.firstName,
          lastName: session.lastName,
          username: session.username,
          photoUrl: session.photoUrl,
        };

        return res.json({
          authenticated: true,
          user,
          sessionId: session.sessionId,
        });
      }

      logger.debug('[Auth] No session found for token', { token: token.substring(0, 10) + '...' });
      return res.json({
        authenticated: false,
      });
    } catch (error) {
      logger.error('[Auth] Error checking session by token:', error);
      return res.status(500).json({
        error: 'Internal server error'
      });
    }
  });

  /**
   * POST /api/auth/telegram/bot/login
   * Creates a session from bot authentication
   * Called by bot when user sends /start with auth token
   */
  router.post('/telegram/bot/login', async (req: express.Request, res: express.Response) => {
    try {
      const { telegramId, firstName, lastName, username, photoUrl, authToken } = req.body;

      if (!telegramId || !firstName) {
        return res.status(400).json({
          error: 'telegramId and firstName are required'
        });
      }

      // Check if session already exists for this user
      let sessionUser = await getSessionByTelegramId(telegramId);

      if (!sessionUser) {
        // Create new session with auth token
        const sessionId = await createSession({
          telegramId,
          firstName,
          lastName,
          username,
          photoUrl,
          authToken, // Store auth token in session
        });

        sessionUser = await getSessionUser(sessionId);
        logger.info(`[Auth] Created session from bot for user ${telegramId} with token ${authToken}`);
      } else {
        // Update existing session and add auth token if not present
        // Note: lastActivity is updated automatically in getSessionByTelegramId
        // If we need to update authToken, we should do it via database update
        if (authToken && !sessionUser.authToken) {
          // Update auth token in database
          const db = (database as any)?.db;
          if (db) {
            const { eq } = await import('drizzle-orm');
            const { telegramSessionTable } = await import('@elizaos/plugin-sql');
            await db
              .update(telegramSessionTable)
              .set({ authToken })
              .where(eq(telegramSessionTable.sessionId, sessionUser.sessionId));
            sessionUser.authToken = authToken;
          }
        }
        logger.info(`[Auth] Updated existing session for user ${telegramId}`);
      }

      if (!sessionUser) {
        return res.status(500).json({
          error: 'Failed to create session'
        });
      }

      const user: TelegramUser = {
        id: sessionUser.telegramId,
        firstName: sessionUser.firstName,
        lastName: sessionUser.lastName,
        username: sessionUser.username,
        photoUrl: sessionUser.photoUrl,
      };

      res.json({
        success: true,
        user,
        sessionId: sessionUser.sessionId,
      });
    } catch (error) {
      logger.error('[Auth] Bot login error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  });

  /**
   * POST /api/auth/logout
   * Logs out the current user
   */
  router.post('/logout', async (req: express.Request, res: express.Response) => {
    const sessionId = 
      req.headers.authorization?.replace('Bearer ', '') ||
      req.headers['x-session-id'] as string ||
      req.body?.sessionId;

    if (!sessionId) {
      return res.status(400).json({ 
        error: 'No session provided' 
      });
    }

    const deleted = await deleteSession(sessionId);

    if (deleted) {
      logger.info(`[Auth] Session ${sessionId} deleted`);
      res.json({ success: true });
    } else {
      res.status(404).json({ 
        error: 'Session not found' 
      });
    }
  });

  return router;
}

