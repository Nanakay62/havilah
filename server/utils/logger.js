'use strict';

const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  redact: [
    'req.headers.authorization',
    'req.headers.cookie',
    'body.password',
    'body.email',
    'body.token',
    'body.refreshToken'
  ],
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

module.exports = logger;
