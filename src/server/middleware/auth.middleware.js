const jwt = require('jsonwebtoken');
const config = require('../config/env');
const db = require('../database/connection');

const PUBLIC_PATHS = new Set([
  '/login.html',
  '/setup.html',
  '/api/login',
  '/api/public/check-setup',
  '/api/public/setup',
  '/api/public/settings',
  '/api/server-time',
  '/api/sync/apply',
  '/api/sync/ping',
  '/responsive.css',
  '/router.js',
  '/auth.js',
]);

function isPublicRequest(req) {
  if (PUBLIC_PATHS.has(req.path)) return true;
  if (req.path.startsWith('/assets/')) return true;
  if (req.path.startsWith('/logos/')) return true;
  return false;
}

async function authMiddleware(req, res, next) {
  // Always extract token if it exists in cookies
  const token = req.cookies?.token;
  if (token) {
    try {
      const decoded = jwt.verify(token, config.JWT_SECRET);
      req.user = decoded; // { id, username, role, branch_id, permissions }
    } catch (err) {
      res.clearCookie('token');
      req.user = null;
    }
  }

  // Allow public assets and login/setup routes
  if (isPublicRequest(req)) {
    return next();
  }

  // If user is authenticated, continue
  if (req.user) {
    return next();
  }

  // If it's an unauthenticated API call, return 401
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // For page requests, check if system needs initial setup
  try {
    if (!config.IS_BRANCH_MODE) {
      const { rows } = await db.query('SELECT COUNT(*) as count FROM users');
      const needsSetup = Number(rows[0]?.count || 0) === 0;

      if (needsSetup && req.path !== '/setup.html') {
        return res.redirect('/setup.html');
      }
      if (!needsSetup && req.path === '/setup.html') {
        return res.redirect('/login.html');
      }
    }

    if (req.path === '/' || req.path.endsWith('.html')) {
      if (req.path !== '/login.html' && req.path !== '/setup.html') {
        return res.redirect('/login.html');
      }
    }

    next();
  } catch (err) {
    console.error('Auth middleware navigation error:', err.message);
    res.redirect('/login.html');
  }
}

module.exports = {
  authMiddleware,
  isPublicRequest,
};
