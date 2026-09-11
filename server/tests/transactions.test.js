'use strict';

const mongoose = require('mongoose');
const { withTransaction } = require('../utils/dbTransaction');

describe('MongoDB Multi-Document ACID Transactions & Replica Resilience (Stage 2 Gate)', () => {
  it('executes operation callback and returns result in fallback/active state', async () => {
    const mockResult = { status: 'committed', count: 42 };
    const result = await withTransaction(async (session) => {
      // Operation receives session (either ClientSession or null if standalone)
      return mockResult;
    });

    expect(result).toEqual(mockResult);
  });

  it('re-throws operational error thrown inside transaction callback to ensure rollback', async () => {
    const errorToThrow = new Error('SIMULATED_DB_WRITE_FAILURE');

    await expect(
      withTransaction(async (session) => {
        throw errorToThrow;
      })
    ).rejects.toThrow('SIMULATED_DB_WRITE_FAILURE');
  });

  it('falls back to non-transactional execution when MongoDB reports standalone error', async () => {
    // Create a mock session that simulates a MongoDB standalone replica-set error
    const originalReadyState = mongoose.connection.readyState;
    const originalStartSession = mongoose.startSession;
    try {
      Object.defineProperty(mongoose.connection, 'readyState', {
        value: 1,
        configurable: true,
        writable: true,
      });

      mongoose.startSession = async () => ({
        withTransaction: async (cb) => {
          const err = new Error(
            'Transaction numbers are only allowed on a replica set member or mongos'
          );
          err.code = 20;
          throw err;
        },
        endSession: async () => {},
      });

      let fallbackExecuted = false;
      const result = await withTransaction(async (session) => {
        if (session === null) {
          fallbackExecuted = true;
        }
        return 'fallback_success';
      });

      expect(fallbackExecuted).toBe(true);
      expect(result).toBe('fallback_success');
    } finally {
      mongoose.startSession = originalStartSession;
      Object.defineProperty(mongoose.connection, 'readyState', {
        value: originalReadyState,
        configurable: true,
        writable: true,
      });
    }
  });

  it('correctly commits and calls endSession on successful transaction execution', async () => {
    let sessionEnded = false;
    let transactionCommitted = false;

    const originalReadyState = mongoose.connection.readyState;
    const originalStartSession = mongoose.startSession;
    try {
      Object.defineProperty(mongoose.connection, 'readyState', {
        value: 1,
        configurable: true,
        writable: true,
      });

      mongoose.startSession = async () => ({
        withTransaction: async (cb) => {
          await cb();
          transactionCommitted = true;
        },
        endSession: async () => {
          sessionEnded = true;
        },
      });

      const res = await withTransaction(async (session) => {
        return { success: true };
      });

      expect(res.success).toBe(true);
      expect(transactionCommitted).toBe(true);
      expect(sessionEnded).toBe(true);
    } finally {
      mongoose.startSession = originalStartSession;
      Object.defineProperty(mongoose.connection, 'readyState', {
        value: originalReadyState,
        configurable: true,
        writable: true,
      });
    }
  });

  it('ensures endSession is invoked even when an unhandled error occurs', async () => {
    let sessionEnded = false;

    const originalReadyState = mongoose.connection.readyState;
    const originalStartSession = mongoose.startSession;
    try {
      Object.defineProperty(mongoose.connection, 'readyState', {
        value: 1,
        configurable: true,
        writable: true,
      });

      mongoose.startSession = async () => ({
        withTransaction: async (cb) => {
          await cb();
        },
        endSession: async () => {
          sessionEnded = true;
        },
      });

      await expect(
        withTransaction(async () => {
          throw new Error('UNEXPECTED_BUSINESS_EXCEPTION');
        })
      ).rejects.toThrow('UNEXPECTED_BUSINESS_EXCEPTION');

      expect(sessionEnded).toBe(true);
    } finally {
      mongoose.startSession = originalStartSession;
      Object.defineProperty(mongoose.connection, 'readyState', {
        value: originalReadyState,
        configurable: true,
        writable: true,
      });
    }
  });
});
