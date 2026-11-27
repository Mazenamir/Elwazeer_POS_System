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
  if (explicitStatus && explicitStatus >= 400 && explicitStatus < 500 && !/^(08|22|23|28|3D|40|42|53|55|57)/.test(code)) {
    return {
      statusCode: explicitStatus,
      code: code || 'REQUEST_ERROR',
      message: rawMessage || 'طلب غير صالح',
      shouldLog: false,
    };
  }

  // PostgreSQL & SQLite known error translations
  if (code === '28P01' || code === '28000' || /password authentication failed/i.test(rawMessage)) {
    return {
      statusCode: 503,
      code: 'DB_AUTH_FAILED',
      message: 'فشل التحقق من بيانات الاتصال بقاعدة البيانات، يرجى مراجعة إعدادات الخادم (DB_USER / DB_PASSWORD)',
      shouldLog: true,
    };
  }

  if (code === '3D000' || /database .* does not exist/i.test(rawMessage)) {
    return {
      statusCode: 503,
      code: 'DB_NOT_FOUND',
      message: 'قاعدة البيانات المحددة غير موجودة على الخادم، يرجى التحقق من إعدادات DB_NAME',
      shouldLog: true,
    };
  }

  if (
    code === '53100' ||
    code === '53200' ||
    code === '53300' ||
    /too many clients already|remaining connection slots are reserved/i.test(rawMessage)
  ) {
    return {
      statusCode: 503,
      code: 'DB_OVERLOADED',
      message: 'خادم قاعدة البيانات مزدحم حالياً، يرجى المحاولة بعد لحظات',
      shouldLog: true,
    };
  }

  if (
    code === '57014' ||
    /canceling statement due to statement timeout|Query read timeout/i.test(rawMessage)
  ) {
    return {
      statusCode: 504,
      code: 'DB_QUERY_TIMEOUT',
      message: 'استغرقت العملية وقتاً أطول من المسموح به، يرجى تضييق نطاق البحث أو المحاولة مرة أخرى',
      shouldLog: true,
    };
  }

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

  if (code === '23514' || /CHECK constraint failed/i.test(rawMessage)) {
    return {
      statusCode: 400,
      code: 'DB_CHECK_VIOLATION',
      message: 'القيمة المدخلة غير مسموح بها أو تخالف قيود البيانات',
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

  if (code === '22003' || /numeric field overflow/i.test(rawMessage)) {
    return {
      statusCode: 400,
      code: 'DB_NUMERIC_OVERFLOW',
      message: 'القيمة الرقمية المدخلة أكبر من الحد المسموح به',
      shouldLog: true,
    };
  }

  if (code === '22007' || code === '22008') {
    return {
      statusCode: 400,
      code: 'DB_INVALID_DATE',
      message: 'صيغة التاريخ أو الوقت المدخلة غير صالحة',
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

  if (code === '40P01' || code === '40001' || code === '55P03') {
    return {
      statusCode: 409,
      code: 'DB_DEADLOCK',
      message: 'حدث تعارض مؤقت أثناء حفظ البيانات، يرجى المحاولة مرة أخرى',
      shouldLog: true,
    };
  }

  if (code === '42P01' || code === '42703' || /no such column|no such table/i.test(rawMessage)) {
    return {
      statusCode: 500,
      code: 'DB_SCHEMA_MISMATCH',
      message: 'يوجد تحديث مطلوب لهيكل قاعدة البيانات، يرجى إعادة تشغيل الخادم لتطبيق التحديثات',
      shouldLog: true,
    };
  }

  if (
    code === '57P03' ||
    code === '57P02' ||
    code === '57P01' ||
    code === '08000' ||
    code === '08001' ||
    code === '08003' ||
    code === '08004' ||
    code === '08006' ||
    code === '08P01' ||
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'EPIPE' ||
    code === 'EHOSTUNREACH' ||
    code === 'ENETUNREACH' ||
    code === 'SQLITE_BUSY' ||
    /database is locked|Connection terminated unexpectedly|terminating connection due to administrator command|the database system is starting up|the database system is in recovery mode|Client has encountered a connection error/i.test(rawMessage)
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
