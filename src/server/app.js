const express = require('express');
const path = require('path');
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

const app = express();


// Security headers (Tailwind runtime and Alpine need inline styles/eval)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    // Allow local desktop app, null origin, and local addresses
    callback(null, true);
  },
  credentials: true,
}));

// Body parsers with large limit for image upload compatibility
app.use(express.json({ limit: config.REQUEST_BODY_LIMIT }));
app.use(express.urlencoded({ limit: config.REQUEST_BODY_LIMIT, extended: true }));
app.use(cookieParser());

// Duplicate request prevention guard
app.use(duplicateMutationGuard);

// Global Authentication & Authorization Middleware
app.use(authMiddleware);

// Static file protection & serving (serves src/renderer)
const rendererPath = path.join(__dirname, '../renderer');
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  if (req.path.includes('..') || req.path.startsWith('/node_modules/') || req.path.startsWith('/scratch/')) {
    return res.sendStatus(404);
  }
  if (req.path.startsWith('/.') || req.path.endsWith('.json') || req.path.endsWith('.lock')) {
    return res.sendStatus(404);
  }
  // Allow library JS files in assets/js/
  if (req.path.endsWith('.js') && !PUBLIC_STATIC_FILES.has(req.path) && !req.path.startsWith('/assets/js/')) {
    return res.sendStatus(404);
  }
  next();
});

// Shortcut GET /logout
app.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/login.html');
});

// Mount Static Renderer Files
app.use(express.static(rendererPath));

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

// Central error handler
app.use(errorHandler);

module.exports = app;
