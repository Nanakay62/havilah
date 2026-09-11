'use strict';

const crypto = require('crypto');
const logger = require('./logger');

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

/**
 * Checks whether Paystack API keys are configured and valid.
 * @returns {boolean}
 */
function isConfigured() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  return Boolean(key && !key.includes('replace_with') && !key.includes('placeholder'));
}

/**
 * Helper to get authorization header for Paystack requests.
 * @private
 * @returns {Record<string, string>}
 */
function getHeaders() {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    throw new Error('PAYSTACK_SECRET_KEY is not configured');
  }
  return {
    'Authorization': `Bearer ${secretKey}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
}

/**
 * Validates the HMAC-SHA512 signature on incoming Paystack webhooks.
 *
 * @param {Buffer|string} rawBody - Raw unparsed request payload.
 * @param {string} signature - The `x-paystack-signature` header.
 * @returns {boolean}
 */
function verifyWebhookSignature(rawBody, signature) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey || !signature || !rawBody) {
    return false;
  }

  try {
    const hash = crypto
      .createHmac('sha512', secretKey)
      .update(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'))
      .digest('hex');

    const hashBuffer = Buffer.from(hash, 'utf8');
    const signatureBuffer = Buffer.from(signature, 'utf8');

    if (hashBuffer.length !== signatureBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(hashBuffer, signatureBuffer);
  } catch (err) {
    logger.error({ err: err.message }, '[Paystack] Signature verification error');
    return false;
  }
}

/**
 * Initializes a Paystack transaction for checkout or subscription.
 *
 * @param {Object} params
 * @param {string} params.email - Customer email address.
 * @param {number} params.amountInPesewas - Amount in pesewas (1 GHS = 100 pesewas).
 * @param {string} [params.planCode] - Paystack Plan code (e.g., PLN_xxxxxx) for recurring billing.
 * @param {string} [params.callbackUrl] - URL to redirect the user after payment completion.
 * @param {Record<string, any>} [params.metadata] - Custom metadata (e.g. company_id, tier).
 * @param {Array<string>} [params.channels] - Supported channels (defaults to ['card', 'mobile_money']).
 * @returns {Promise<{ authorization_url: string, access_code: string, reference: string }>}
 */
async function initializeTransaction({
  email,
  amountInPesewas,
  planCode,
  callbackUrl,
  metadata = {},
  channels = ['card', 'mobile_money']
}) {
  if (!isConfigured()) {
    throw new Error('PAYSTACK_NOT_CONFIGURED');
  }

  const payload = {
    email,
    amount: amountInPesewas,
    currency: 'GHS',
    channels,
    metadata,
    ...(callbackUrl ? { callback_url: callbackUrl } : {}),
    ...(planCode ? { plan: planCode } : {})
  };

  const response = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload)
  });

  const body = await response.json();
  if (!response.ok || !body.status) {
    const message = body?.message || `Paystack initialize failed (${response.status})`;
    logger.error({ error: body, status: response.status }, '[Paystack] Initialize transaction failed');
    throw new Error(message);
  }

  return body.data;
}

/**
 * Verifies a transaction by its reference.
 *
 * @param {string} reference
 * @returns {Promise<Record<string, any>>}
 */
async function verifyTransaction(reference) {
  if (!isConfigured()) {
    throw new Error('PAYSTACK_NOT_CONFIGURED');
  }

  const response = await fetch(`${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
    method: 'GET',
    headers: getHeaders()
  });

  const body = await response.json();
  if (!response.ok || !body.status) {
    const message = body?.message || `Paystack verify failed (${response.status})`;
    logger.error({ error: body, reference }, '[Paystack] Verify transaction failed');
    throw new Error(message);
  }

  return body.data;
}

/**
 * Fetches subscription details from Paystack by code.
 *
 * @param {string} subscriptionCode
 * @returns {Promise<Record<string, any>>}
 */
async function getSubscription(subscriptionCode) {
  if (!isConfigured()) {
    throw new Error('PAYSTACK_NOT_CONFIGURED');
  }

  const response = await fetch(`${PAYSTACK_BASE_URL}/subscription/${encodeURIComponent(subscriptionCode)}`, {
    method: 'GET',
    headers: getHeaders()
  });

  const body = await response.json();
  if (!response.ok || !body.status) {
    const message = body?.message || `Paystack fetch subscription failed (${response.status})`;
    logger.error({ error: body, subscriptionCode }, '[Paystack] Get subscription failed');
    throw new Error(message);
  }

  return body.data;
}

/**
 * Generates a subscription management link that can be shared with or visited by the customer.
 *
 * @param {string} subscriptionCode
 * @returns {Promise<string>} Management URL
 */
async function generateSubscriptionManageLink(subscriptionCode) {
  if (!isConfigured()) {
    throw new Error('PAYSTACK_NOT_CONFIGURED');
  }

  const response = await fetch(`${PAYSTACK_BASE_URL}/subscription/${encodeURIComponent(subscriptionCode)}/manage/link`, {
    method: 'GET',
    headers: getHeaders()
  });

  const body = await response.json();
  if (!response.ok || !body.status) {
    const message = body?.message || `Paystack generate manage link failed (${response.status})`;
    logger.error({ error: body, subscriptionCode }, '[Paystack] Generate manage link failed');
    throw new Error(message);
  }

  return body.data?.link || null;
}

/**
 * Disables (cancels auto-renewal for) a Paystack recurring subscription.
 *
 * @param {Object} params
 * @param {string} params.code - Subscription code (SUB_xxxxxx).
 * @param {string} params.token - Email token for authorization.
 * @returns {Promise<boolean>}
 */
async function disableSubscription({ code, token }) {
  if (!isConfigured()) {
    throw new Error('PAYSTACK_NOT_CONFIGURED');
  }

  const response = await fetch(`${PAYSTACK_BASE_URL}/subscription/disable`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ code, token })
  });

  const body = await response.json();
  if (!response.ok || !body.status) {
    const message = body?.message || `Paystack disable subscription failed (${response.status})`;
    logger.error({ error: body, code }, '[Paystack] Disable subscription failed');
    throw new Error(message);
  }

  return true;
}

/**
 * Creates a refund for a prior transaction.
 *
 * @param {Object} params
 * @param {string} params.transactionReference - Reference or ID of the transaction to refund.
 * @param {number} [params.amountInPesewas] - Optional partial refund amount in pesewas.
 * @param {string} [params.customerNote] - Note visible to the customer.
 * @param {string} [params.merchantNote] - Internal note for the merchant.
 * @returns {Promise<Record<string, any>>}
 */
async function createRefund({
  transactionReference,
  amountInPesewas,
  customerNote,
  merchantNote
}) {
  if (!isConfigured()) {
    throw new Error('PAYSTACK_NOT_CONFIGURED');
  }

  const payload = {
    transaction: transactionReference,
    ...(amountInPesewas ? { amount: amountInPesewas } : {}),
    ...(customerNote ? { customer_note: customerNote } : {}),
    ...(merchantNote ? { merchant_note: merchantNote } : {})
  };

  const response = await fetch(`${PAYSTACK_BASE_URL}/refund`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload)
  });

  const body = await response.json();
  if (!response.ok || !body.status) {
    const message = body?.message || `Paystack refund creation failed (${response.status})`;
    logger.error({ error: body, transactionReference }, '[Paystack] Create refund failed');
    throw new Error(message);
  }

  return body.data;
}

/**
 * Gets the status of a previously requested refund.
 *
 * @param {string} refundReference
 * @returns {Promise<Record<string, any>>}
 */
async function getRefundStatus(refundReference) {
  if (!isConfigured()) {
    throw new Error('PAYSTACK_NOT_CONFIGURED');
  }

  const response = await fetch(`${PAYSTACK_BASE_URL}/refund/${encodeURIComponent(refundReference)}`, {
    method: 'GET',
    headers: getHeaders()
  });

  const body = await response.json();
  if (!response.ok || !body.status) {
    const message = body?.message || `Paystack get refund status failed (${response.status})`;
    logger.error({ error: body, refundReference }, '[Paystack] Get refund status failed');
    throw new Error(message);
  }

  return body.data;
}

module.exports = {
  isConfigured,
  verifyWebhookSignature,
  initializeTransaction,
  verifyTransaction,
  getSubscription,
  generateSubscriptionManageLink,
  disableSubscription,
  createRefund,
  getRefundStatus
};
