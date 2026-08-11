'use strict';

const mongoose = require('mongoose');

let Alert;
try {
  Alert = mongoose.model('Alert');
} catch (e) {
  const AlertSchema = new mongoose.Schema(
    {
      tenant_id: { type: String, index: true },
      company_id: { type: String, index: true },
      severity: String,
      alert_type: String,
      created_at: { type: Date, default: Date.now }
    },
    { strict: false }
  );

  const origDeleteMany = mongoose.Model.deleteMany;
  AlertSchema.statics.deleteMany = function(query, ...args) {
    if (query && (query.tenant_id || query.company_id)) {
      const id = query.tenant_id || query.company_id;
      return origDeleteMany.call(this, { $or: [{ tenant_id: id }, { company_id: id }] }, ...args);
    }
    return origDeleteMany.call(this, query, ...args);
  };

  Alert = mongoose.model('Alert', AlertSchema);
}

module.exports = Alert;
