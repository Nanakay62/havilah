'use strict';

const mongoose = require('mongoose');

let PulseResponse;
try {
  PulseResponse = mongoose.model('PulseResponse');
} catch (e) {
  const PulseResponseSchema = new mongoose.Schema(
    {
      tenant_id: { type: String, index: true },
      company_id: { type: String, index: true },
      score: Number,
      created_at: { type: Date, default: Date.now }
    },
    { strict: false }
  );

  // Intercept deleteMany to check both tenant_id and company_id
  const origDeleteMany = mongoose.Model.deleteMany;
  PulseResponseSchema.statics.deleteMany = function(query, ...args) {
    if (query && (query.tenant_id || query.company_id)) {
      const id = query.tenant_id || query.company_id;
      return origDeleteMany.call(this, { $or: [{ tenant_id: id }, { company_id: id }] }, ...args);
    }
    return origDeleteMany.call(this, query, ...args);
  };

  PulseResponse = mongoose.model('PulseResponse', PulseResponseSchema);
}

module.exports = PulseResponse;
