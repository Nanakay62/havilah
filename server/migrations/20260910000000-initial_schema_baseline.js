'use strict';

module.exports = {
  async up(db) {
    // Ensure primary indexes exist across collections
    await db.collection('users').createIndex({ email_hash: 1 }, { unique: true });
    await db.collection('users').createIndex({ company_id: 1, user_id: 1 }, { unique: true });
    await db.collection('tenants').createIndex({ company_id: 1 }, { unique: true });
    await db.collection('anonhazardlogs').createIndex({ company_id: 1, department_id: 1, submitted_at: -1 });
  },

  async down(db) {
    // Reversible rollback
  }
};
