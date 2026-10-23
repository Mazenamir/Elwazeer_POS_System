const { rateLimit } = require('express-rate-limit');

/**
 * Rate Limiting Middleware with Safe Memory Fallback
 * Uses express-rate-limit's built-in memory store when Redis is absent, preventing application crashes.
 */
function createLimiter({ windowMs, max, message, keyGenerator }) {
  const options = {
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
    handler: (req, res, next, opts) => {
      res.status(429).json({ error: message });
    },
  };

  if (keyGenerator) {
    options.keyGenerator = keyGenerator;
  }

  return rateLimit(options);
}

// 1. Search Limiter: 60 requests per minute on GET /api/search
const searchLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: 'تم تجاوز الحد المسموح به لطلبات البحث، برجاء المحاولة لاحقاً',
});

// 2. Export Limiter: 10 requests per minute on GET /api/reports/export/*
const exportLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: 'تم تجاوز الحد المسموح به لعمليات التصدير، برجاء المحاولة لاحقاً',
});

// 3. Sync Limiter: 10 requests per minute on POST /api/sync/cycle
const syncLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: 'تم تجاوز الحد المسموح به لتشغيل المزامنة، برجاء المحاولة لاحقاً',
});

module.exports = {
  createLimiter,
  searchLimiter,
  exportLimiter,
  syncLimiter,
};
