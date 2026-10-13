const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const config = require('./config/env');
const { duplicateMutationGuard } = require('./middleware/dedup.middleware');
const { authMiddleware } = require('./middleware/auth.middleware');
const { errorHandler } = require('./middleware/error.middleware');
const { PUBLIC_STATIC_FILES } = require('../shared/constants/system');

// Route modules
const authRoutes = require('./modules/auth/auth.routes');
const branchesRoutes = require('./modules/branches/branches.routes');
const customersRoutes = require('./modules/customers/customers.routes');
const settingsRoutes = require('./modules/settings/settings.routes');
const inventoryRoutes = require('./modules/inventory/inventory.routes');
const suppliersRoutes = require('./modules/suppliers/suppliers.routes');
const salesRoutes = require('./modules/sales/sales.routes');
const rentalsRoutes = require('./modules/rentals/rentals.routes');
const tailoringRoutes = require('./modules/tailoring/tailoring.routes');
const employeesRoutes = require('./modules/hr/employees.routes');
const expensesRoutes = require('./modules/expenses/expenses.routes');
const reportsRoutes = require('./modules/reports/reports.routes');
const syncRoutes = require('./modules/sync/sync.routes');
const wornRoutes = require('./modules/worn/worn.routes');

const app = express();


// Security headers (Tailwind runtime and Alpine need inline styles/eval)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
}));

// CORS configuration - strict local, LAN, and same-host origin verification
const LOCAL_ORIGIN_REGEX = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/i;

function isAllowedOrigin(origin, req) {
  if (!origin || origin === 'null') return true;
  if (LOCAL_ORIGIN_REGEX.test(origin)) return true;

  // Allow requests where origin host matches the server host being accessed (Same-Host / Same-Origin)
  const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host;
  if (host) {
    if (origin === `http://${host}` || origin === `https://${host}`) {
      return true;
    }
    try {
      const parsedOrigin = new URL(origin);
      if (parsedOrigin.host.toLowerCase() === host.toLowerCase()) {
        return true;
      }
    } catch {}
  }

  // Allow explicitly configured CORS origins in .env
  if (config.CORS_ORIGIN) {
    const allowed = config.CORS_ORIGIN.split(',').map((s) => s.trim().toLowerCase());
    if (allowed.includes('*') || allowed.includes(origin.toLowerCase())) {
      return true;
    }
  }

  return false;
}

app.use(cors((req, callback) => {
  const origin = req.header('Origin');
  if (isAllowedOrigin(origin, req)) {
    callback(null, { origin: true, credentials: true });
  } else {
    callback(null, { origin: false });
  }
}));

// Body parsers with large limit for image upload compatibility
app.use(express.json({ limit: config.REQUEST_BODY_LIMIT }));
app.use(express.urlencoded({ limit: config.REQUEST_BODY_LIMIT, extended: true }));
app.use(cookieParser());

// Duplicate request prevention guard
app.use(duplicateMutationGuard);

// Global Authentication & Authorization Middleware
app.use(authMiddleware);

// Static file protection & serving (serves React SPA dist first, then renderer fallback)
const rendererPath = fs.existsSync(path.join(config.appRoot, 'src/renderer'))
  ? path.join(config.appRoot, 'src/renderer')
  : path.join(__dirname, '../renderer');
const distPath = fs.existsSync(path.join(config.appRoot, 'dist/renderer'))
  ? path.join(config.appRoot, 'dist/renderer')
  : fs.existsSync(path.join(__dirname, '../../dist/renderer'))
  ? path.join(__dirname, '../../dist/renderer')
  : (fs.existsSync(path.join(__dirname, '../../dist')) && fs.existsSync(path.join(__dirname, '../../dist/index.html')))
  ? path.join(__dirname, '../../dist')
  : path.join(__dirname, '../renderer/dist');

app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
  if (req.path.includes('..') || req.path.startsWith('/node_modules/') || req.path.startsWith('/scratch/')) {
    return res.sendStatus(404);
  }
  if (req.path.startsWith('/.') || req.path.endsWith('.json') || req.path.endsWith('.lock')) {
    return res.sendStatus(404);
  }
  // Allow library JS files in assets/js/ or compiled Vite assets in /assets/
  if (req.path.endsWith('.js') && !PUBLIC_STATIC_FILES.has(req.path) && !req.path.startsWith('/assets/')) {
    return res.sendStatus(404);
  }
  next();
});

// Legacy .html redirects to React SPA routes
const LEGACY_ROUTE_MAP = {
  '/index.html': '/pos',
  '/dashboard.html': '/dashboard',
  '/rentals.html': '/rentals',
  '/rentalinventory.html': '/rental-inventory',
  '/alterations.html': '/alterations',
  '/tailoring.html': '/tailoring',
  '/customers.html': '/customers',
  '/suppliers.html': '/suppliers',
  '/employees.html': '/employees',
  '/expenses.html': '/expenses',
  '/reports.html': '/reports',
  '/barcodes.html': '/barcodes',
  '/settings.html': '/settings',
  '/wornproducts.html': '/worn-products',
  '/login.html': '/login',
  '/setup.html': '/setup',
};

app.use((req, res, next) => {
  const lowerPath = req.path.toLowerCase();
  if (LEGACY_ROUTE_MAP[lowerPath]) {
    return res.redirect(LEGACY_ROUTE_MAP[lowerPath]);
  }
  next();
});

// Shortcut GET /logout
app.get('/logout', (req, res) => {
  res.clearCookie('token');
  const hasSpa = fs.existsSync(path.join(distPath, 'index.html'));
  res.redirect(hasSpa ? '/login' : '/login.html');
});

// Mount Static Renderer Files (Serve SPA first if available)
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}
app.use(express.static(rendererPath));

// Static uploads serving
app.use('/uploads', express.static(config.UPLOADS_DIR));

// Mount Domain API Modules
app.use('/api', authRoutes);
app.use('/api', branchesRoutes);
app.use('/api', customersRoutes);
app.use('/api', settingsRoutes);
app.use('/api', inventoryRoutes);
app.use('/api', suppliersRoutes);
app.use('/api', salesRoutes);
app.use('/api', rentalsRoutes);
app.use('/api', tailoringRoutes);
app.use('/api', employeesRoutes);
app.use('/api', expensesRoutes);
app.use('/api', reportsRoutes);
app.use('/api', syncRoutes);
app.use('/api', wornRoutes);

// SPA client fallback for HTML5 History API
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api/')) return next();
  const distIndex = path.join(distPath, 'index.html');
  if (fs.existsSync(distIndex)) {
    return res.sendFile(distIndex);
  }
  next();
});

// Central error handler
app.use(errorHandler);

module.exports = app;
