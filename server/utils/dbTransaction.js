'use strict';

const mongoose = require('mongoose');
const logger = require('./logger');

/**
 * Executes an operation inside a MongoDB transaction if replica sets are available.
 * If the MongoDB instance is standalone (single node / local dev) or does not support
 * multi-document transactions, it falls back safely to executing without a transaction session.
 *
 * @param {Function} operation - Async function receiving (session). Pass { session } to Mongoose calls.
 * @returns {Promise<any>} Result of the operation callback
 */
async function withTransaction(operation) {
  if (!mongoose.connection || mongoose.connection.readyState !== 1) {
    logger.debug('Database is not connected; executing operation without transaction session');
    return await operation(null);
  }

  let session = null;
  try {
    session = await mongoose.startSession();
  } catch (sessionErr) {
    logger.warn(
      { err: sessionErr.message },
      'Unable to start Mongoose session; executing operation without transaction'
    );
    return await operation(null);
  }

  try {
    let result;
    await session.withTransaction(async () => {
      result = await operation(session);
    });
    return result;
  } catch (err) {
    // Detect standalone MongoDB server (transactions require replica sets)
    const isStandaloneError =
      err.message?.includes('replica set') ||
      err.message?.includes('Transaction numbers are only allowed') ||
      err.message?.includes('Transactions are not supported') ||
      err.code === 20 ||
      err.codeName === 'IllegalOperation';

    if (isStandaloneError) {
      logger.warn(
        { err: err.message },
        'Standalone MongoDB detected; falling back to non-transactional execution'
      );
      return await operation(null);
    }

    // Rethrow actual business / constraint / validation errors
    throw err;
  } finally {
    if (session) {
      await session.endSession().catch(() => {});
    }
  }
}

module.exports = { withTransaction };
