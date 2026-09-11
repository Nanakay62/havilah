'use strict';

const { ZodError } = require('zod');

/**
 * Express middleware factory to validate request body, query, or params using a Zod schema.
 * @param {import('zod').ZodSchema} schema
 * @param {'body'|'query'|'params'} [target='body']
 */
function validate(schema, target = 'body') {
  return (req, res, next) => {
    try {
      req[target] = schema.parse(req[target] || {});
      next();
    } catch (err) {
      if (err.name === 'ZodError' || err instanceof ZodError || Array.isArray(err.issues) || Array.isArray(err.errors)) {
        const issues = err.issues || err.errors || [];
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: issues.length > 0 ? issues.map(e => `${e.path.join('.') || target}: ${e.message}`).join('; ') : err.message,
          details: issues,
        });
      }
      next(err);
    }
  };
}

module.exports = { validate };
