'use strict';

const GUEST_POOL_COMPANY_ID = '00000000-0000-4000-8000-000000000001';

module.exports = {
  async up(db) {
    // 1. Backfill account_type on existing tenants
    await db.collection('tenants').updateMany(
      { account_type: { $exists: false } },
      { $set: { account_type: 'company' } }
    );

    // 2. Backfill billing.payerType on existing referrals
    await db.collection('referrals').updateMany(
      { 'billing.payerType': { $exists: false } },
      { $set: { 'billing.payerType': 'company_covered' } }
    );

    // 3. Ensure singleton GUEST_CLINICAL_POOL system tenant exists
    const existingGuestPool = await db.collection('tenants').findOne({
      $or: [{ account_type: 'system_guest' }, { slug: 'guest-clinical-pool' }],
    });

    if (!existingGuestPool) {
      const preferredAssessor = await db.collection('assessors').findOne({ active: true });
      await db.collection('tenants').insertOne({
        company_id: GUEST_POOL_COMPANY_ID,
        company_name: 'Guest Clinical Consultations',
        slug: 'guest-clinical-pool',
        account_type: 'system_guest',
        billing_tier: 'free',
        subscription: {
          tier: 'free',
          status: 'active',
          currency: 'GHS',
          maxEmployees: 1,
          welcomeConsultationBenefit: 'none',
          welcomeConsultationUsed: false,
        },
        max_allowed_seats: 1,
        used_seats: 0,
        lifecycle_state: 'active',
        access_expires_at: null,
        activeAssessorId: preferredAssessor ? preferredAssessor._id : null,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }
  },

  async down(db) {
    await db.collection('tenants').deleteOne({ account_type: 'system_guest', slug: 'guest-clinical-pool' });
  },
};
