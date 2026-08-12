'use strict';

const mongoose = require('mongoose');

/**
 * Maximum number of connection retry attempts before process exits.
 * @type {number}
 */
const MAX_RETRIES = 5;

/**
 * Base delay in milliseconds between retry attempts (doubles each attempt).
 * @type {number}
 */
const BASE_RETRY_DELAY_MS = 3000;

/**
 * Connects to MongoDB with exponential-backoff retry logic.
 * Registers connection event handlers and SIGINT/SIGTERM shutdown hooks.
 *
 * @param {string} [uri] - MongoDB connection string; defaults to MONGO_URI env var.
 * @returns {Promise<mongoose.Connection>}
 */
async function connectDB(uri) {
  let mongoURI = uri || process.env.MONGO_URI || process.env.MONGODB_URI;

  /* ───── connection event listeners ───── */
  mongoose.connection.on('connected', () => {
    console.log(`[db] MongoDB connected → ${mongoURI.replace(/\/\/.*@/, '//<credentials>@')}`);
  });

  mongoose.connection.on('error', (err) => {
    console.error('[db] MongoDB connection error:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[db] MongoDB disconnected');
  });

  mongoose.connection.on('reconnected', () => {
    console.log('[db] MongoDB reconnected');
  });

  /* ───── retry loop ───── */
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    try {
      await mongoose.connect(mongoURI, {
        maxPoolSize: 10,
        minPoolSize: 2,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        heartbeatFrequencyMS: 10000,
        retryWrites: true,
        w: 'majority',
      });

      console.log('[db] Connection established successfully');
      break;
    } catch (err) {
      attempt += 1;
      const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      console.error(
        `[db] Connection attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}. ` +
        `Retrying in ${delay}ms…`
      );

      if (attempt >= MAX_RETRIES) {
        console.error('[db] All connection attempts exhausted - exiting process');
        process.exit(1);
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  /* ───── graceful shutdown ───── */
  const shutdown = async (signal) => {
    console.log(`[db] Received ${signal} - closing MongoDB connection...`);
    try {
      await mongoose.connection.close(false);
      console.log('[db] MongoDB connection closed cleanly');
    } catch (err) {
      console.error('[db] Error during MongoDB shutdown:', err.message);
    }
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  return mongoose.connection;
}

module.exports = { connectDB };
