// utils/errorHandler.js
const { ZodError } = require('zod');

exports.handleError = (err, res, next) => {
  if (res.headersSent) return next(err);

  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Validation failed', details: err.errors });
  }
  if (err.status && err.message) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err.code && err.message) {
    // Supabase/Postgres error
    return res.status(400).json({ error: err.message, code: err.code });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
};
