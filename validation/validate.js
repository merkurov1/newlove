// validation/validate.js
const { z } = require('zod');

exports.validateBody = (schema) => (req, res, next) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (err) {
    res.status(400).json({ error: 'Validation failed', details: err.errors });
  }
};

exports.validateParams = (schema) => (req, res, next) => {
  try {
    req.params = schema.parse(req.params);
    next();
  } catch (err) {
    res.status(400).json({ error: 'Invalid route params', details: err.errors });
  }
};
