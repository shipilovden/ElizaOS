import express from 'express';
import { logger } from '@elizaos/core';
import { validateTelegramAuth, convertToTelegramUser } from './telegram';
import { createSession, getSessionUser, deleteSession } from '../../middleware/session';
import type { TelegramAuthData, TelegramUser } from '../../types/telegram';

/**
 * Creates the authentication router
 */
export function authRouter(): express.Router {
  const router = express.Router();

  /**
   * POST /api/auth/telegram/login
   * Validates Telegram authentication data and creates a session
   */
  router.post('/telegram/login', async (req: express.Request, res: express.Response) => {
    try {
      // Prefer custom env var to avoid triggering core telegram plugin loading
      const botToken =
        process.env.AICHAT_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;

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
      const sessionId = createSession({
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
   * GET /api/auth/me
   * Returns current authenticated user
   */
  router.get('/me', (req: express.Request & { sessionUser?: any }, res: express.Response) => {
    const sessionId = 
      req.headers.authorization?.replace('Bearer ', '') ||
      req.headers['x-session-id'] as string ||
      req.query.sessionId as string;

    if (!sessionId) {
      return res.status(401).json({ 
        error: 'No session provided' 
      });
    }

    const sessionUser = getSessionUser(sessionId);

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

    res.json({ user, sessionId: sessionUser.sessionId });
  });

  /**
   * GET /api/auth/telegram/callback
   * Callback endpoint for Telegram Login Widget
   * Telegram widget sends data as query parameters
   */
  router.get('/telegram/callback', async (req: express.Request, res: express.Response) => {
    try {
      // Prefer custom env var to avoid triggering core telegram plugin loading
      const botToken =
        process.env.AICHAT_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;

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
      const sessionId = createSession({
        telegramId: telegramUser.id,
        firstName: telegramUser.firstName,
        lastName: telegramUser.lastName,
        username: telegramUser.username,
        photoUrl: telegramUser.photoUrl,
      });

      logger.info(`[Auth] User ${telegramUser.id} (${telegramUser.firstName}) logged in via callback`);

      // Return HTML page that sends message to opener window
      res.send(`
        <html>
          <head>
            <title>Authentication Successful</title>
          </head>
          <body>
            <h1>Authentication Successful</h1>
            <p>You can close this window.</p>
            <script>
              window.opener?.postMessage({
                type: 'telegram-auth-success',
                user: ${JSON.stringify(telegramUser)},
                sessionId: '${sessionId}'
              }, '*');
              setTimeout(() => window.close(), 1000);
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
   * POST /api/auth/logout
   * Logs out the current user
   */
  router.post('/logout', (req: express.Request, res: express.Response) => {
    const sessionId = 
      req.headers.authorization?.replace('Bearer ', '') ||
      req.headers['x-session-id'] as string ||
      req.body?.sessionId;

    if (!sessionId) {
      return res.status(400).json({ 
        error: 'No session provided' 
      });
    }

    const deleted = deleteSession(sessionId);

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

