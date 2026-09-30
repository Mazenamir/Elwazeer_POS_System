function errorHandler(err, req, res, next) {
  console.error('Unhandled server error:', err);

  const statusCode = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    error: message,
    code: err.code || 'SERVER_ERROR',
  });
}

module.exports = {
  errorHandler,
};
