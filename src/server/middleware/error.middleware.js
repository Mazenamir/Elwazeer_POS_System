/**
 * Elwazeer POS System — Global Express Error Handling Middleware
 * Normalizes PostgreSQL / SQLite / Express errors to clear Arabic messages
 * and logs unexpected errors to the rotating JSONL error log with a traceable errorId.
 */

const config = require('../config/env');
const errorLogger = require('../core/error-logger');

function normalizeServerError(err) {
  const rawMessage = String(err?.message || '');
  const code = String(err?.code || '');
  const errType = String(err?.type || '');
  const explicitStatus = err?.status || err?.statusCode || null;

  // Express body-parser errors
  if (errType === 'entity.too.large' || code === 'LIMIT_FILE_SIZE') {
    return {
      statusCode: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'حجم البيانات أو الملف المرسل أكبر من الحد المسموح به',
      shouldLog: true,
    };
  }
  if (errType === 'entity.parse.failed' || (err instanceof SyntaxError && err.status === 400)) {
    return {
      statusCode: 400,
      code: 'INVALID_JSON',
      message: 'صيغة البيانات المرسلة غير صالحة',
      shouldLog: false,
    };
  }

  // If route/service threw an intentional domain 4xx error without raw DB code, keep it verbatim
  if (explicitStatus && explicitStatus >= 400 && explicitStatus < 500 && !/^(22|23|40|57)/.test(code)) {
    return {
      statusCode: explicitStatus,
      code: code || 'REQUEST_ERROR',
      message: rawMessage || 'طلب غير صالح',
      shouldLog: false,
    };
  }

  // PostgreSQL & SQLite known error translations
  if (
    code === '23505' ||
    code === 'SQLITE_CONSTRAINT_UNIQUE' ||
    /UNIQUE constraint failed/i.test(rawMessage)
  ) {
    return {
      statusCode: 409,
      code: 'DB_UNIQUE_VIOLATION',
      message: 'هذه البيانات مسجلة بالفعل (توجد قيمة مكررة مثل الباركود أو اسم المستخدم)',
      shouldLog: true,
    };
  }

  if (
    code === '23503' ||
    code === 'SQLITE_CONSTRAINT_FOREIGNKEY' ||
    /FOREIGN KEY constraint failed/i.test(rawMessage)
  ) {
    return {
      statusCode: 400,
      code: 'DB_FOREIGN_KEY_VIOLATION',
      message: 'لا يمكن تنفيذ العملية لارتباطها بسجل غير موجود أو بيانات مرتبطة أخرى',
      shouldLog: true,
    };
  }

  if (
    code === '23502' ||
    code === 'SQLITE_CONSTRAINT_NOTNULL' ||
    /NOT NULL constraint failed/i.test(rawMessage)
  ) {
    return {
      statusCode: 400,
      code: 'DB_NOT_NULL_VIOLATION',
      message: 'يوجد حقل مطلوب ناقص، يرجى استكمال جميع البيانات الأساسية',
      shouldLog: true,
    };
  }

  if (code === '22001' || /value too long for type character varying/i.test(rawMessage)) {
    return {
      statusCode: 400,
      code: 'DB_VALUE_TOO_LONG',
      message: 'النص المدخل في أحد الحقول أطول من الحد المسموح به',
      shouldLog: true,
    };
  }

  if (code === '22P02' || /invalid input syntax/i.test(rawMessage)) {
    return {
      statusCode: 400,
      code: 'DB_INVALID_INPUT',
      message: 'صيغة أحد الحقول المدخلة غير صالحة (تأكد من الأرقام والتواريخ)',
      shouldLog: true,
    };
  }

  if (code === '40P01') {
    return {
      statusCode: 409,
      code: 'DB_DEADLOCK',
      message: 'حدث تعارض مؤقت أثناء حفظ البيانات، يرجى المحاولة مرة أخرى',
      shouldLog: true,
    };
  }

  if (
    code === '57P03' ||
    code === '57P01' ||
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'SQLITE_BUSY' ||
    /database is locked/i.test(rawMessage)
  ) {
    return {
      statusCode: 503,
      code: 'DB_UNAVAILABLE',
      message: 'قاعدة البيانات مشغولة أو غير متاحة مؤقتاً، يرجى المحاولة بعد لحظات',
      shouldLog: true,
    };
  }

  const statusCode = explicitStatus || 500;
  const isProd = config.IS_PRODUCTION && process.env.NODE_ENV !== 'test';
  const safeMessage = statusCode >= 500 && isProd
    ? 'حدث خطأ غير متوقع في الخادم، يرجى المحاولة مرة أخرى'
    : (rawMessage || 'Internal Server Error');

  return {
    statusCode,
    code: code || (statusCode >= 500 ? 'SERVER_ERROR' : 'REQUEST_ERROR'),
    message: safeMessage,
    shouldLog: statusCode >= 500,
  };
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const normalized = normalizeServerError(err);
  let errorId = null;

  if (normalized.shouldLog) {
    errorId = errorLogger.logError({
      source: 'server',
      level: normalized.statusCode >= 500 ? 'error' : 'warn',
      code: normalized.code,
      statusCode: normalized.statusCode,
      message: normalized.message,
      rawMessage: err?.message || null,
      method: req?.method || null,
      path: req?.originalUrl || req?.url || null,
      userId: req?.user?.id || null,
      username: req?.user?.username || null,
      branchId: req?.user?.branch_id || null,
      stack: err?.stack || null,
      details: {
        pgCode: err?.code || null,
        pgDetail: err?.detail || null,
        pgConstraint: err?.constraint || null,
        query: req?.query && Object.keys(req.query).length ? req.query : undefined,
        body: req?.body && typeof req.body === 'object' && Object.keys(req.body).length ? req.body : undefined,
      },
    });
  }

  if (normalized.statusCode >= 500) {
    console.error(`[Server Error ${errorId || ''}]`, err);
  }

  const payload = {
    error: normalized.message,
    code: normalized.code,
  };
  if (errorId) {
    payload.errorId = errorId;
  }

  res.status(normalized.statusCode).json(payload);
}

module.exports = {
  normalizeServerError,
  errorHandler,
};
