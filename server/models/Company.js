'use strict';

const mongoose = require('mongoose');
const Tenant = require('./Tenant');

// Add virtual getters to Tenant schema
if (!Tenant.schema.virtuals.name) {
  Tenant.schema.virtual('name').get(function() {
    return this.company_name;
  });
}
if (!Tenant.schema.virtuals.tenant_id) {
  Tenant.schema.virtual('tenant_id').get(function() {
    return this.company_id;
  });
}
if (!Tenant.schema.virtuals.is_trial) {
  Tenant.schema.virtual('is_trial').get(function() {
    return this.billing_tier === 'trial';
  });
}

// Bind Company to the 'tenants' collection so queries target existing tenants
let Company;
try {
  Company = mongoose.model('Company');
} catch (e) {
  Company = mongoose.model('Company', Tenant.schema, 'tenants');
}

module.exports = Company;
