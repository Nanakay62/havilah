'use strict';

async function ensureIndex(collection, spec, options) {
  try {
    await collection.createIndex(spec, options);
  } catch (err) {
    if (err && (err.code === 85 || err.code === 86)) {
      // Index already exists on this key with different options (e.g. Mongoose schema index)
      return;
    }
    throw err;
  }
}

module.exports = {
  async up(db) {
    // Ensure primary indexes exist across collections
    await ensureIndex(db.collection('users'), { email_hash: 1 }, { unique: true });
    await ensureIndex(db.collection('users'), { company_id: 1, user_id: 1 }, { unique: true });
    await ensureIndex(db.collection('tenants'), { company_id: 1 }, { unique: true });
    await ensureIndex(db.collection('anonhazardlogs'), { company_id: 1, department_id: 1, submitted_at: -1 });
  },

  async down(db) {
    // Reversible rollback
  }
};
