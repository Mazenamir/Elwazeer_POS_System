function errorHandler(err, req, res, next) {
  const statusCode = err.status || err.statusCode || 500;
  if (statusCode >= 500) {
    console.error('Unhandled server error:', err);
  }

  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    error: message,
    code: err.code || (statusCode >= 500 ? 'SERVER_ERROR' : 'REQUEST_ERROR'),
  });
}

module.exports = {
  errorHandler,
};
