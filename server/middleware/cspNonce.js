'use strict';

const crypto = require('crypto');

/**
 * Middleware that generates a cryptographically secure, per-request nonce
 * and automatically injects it into HTML script and style elements.
 * Intercepts responses with Content-Type text/html (including express.static and res.sendFile).
 */
function cspNonceMiddleware(req, res, next) {
  const nonce = crypto.randomBytes(16).toString('base64');
  res.locals.cspNonce = nonce;

  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);
  const chunks = [];
  let isHtml = false;

  res.write = function (chunk, encoding, callback) {
    const contentType = res.getHeader('content-type') || '';
    if (typeof contentType === 'string' && contentType.includes('text/html')) {
      isHtml = true;
      if (chunk) {
        chunks.push(
          Buffer.isBuffer(chunk)
            ? chunk
            : Buffer.from(chunk, typeof encoding === 'string' ? encoding : 'utf8')
        );
      }
      if (typeof callback === 'function') callback();
      return true;
    }
    return originalWrite(chunk, encoding, callback);
  };

  res.end = function (chunk, encoding, callback) {
    if (typeof chunk === 'function') {
      callback = chunk;
      chunk = null;
    } else if (typeof encoding === 'function') {
      callback = encoding;
      encoding = undefined;
    }

    const contentType = res.getHeader('content-type') || '';
    if (isHtml || (typeof contentType === 'string' && contentType.includes('text/html'))) {
      if (chunk) {
        chunks.push(
          Buffer.isBuffer(chunk)
            ? chunk
            : Buffer.from(chunk, typeof encoding === 'string' ? encoding : 'utf8')
        );
      }

      let body = Buffer.concat(chunks).toString('utf8');

      // Inject nonce into any <script> and <style> tags lacking one
      body = body
        .replace(/<script\b(?![^>]*\bnonce=)([^>]*)>/gi, `<script nonce="${nonce}"$1>`)
        .replace(/<style\b(?![^>]*\bnonce=)([^>]*)>/gi, `<style nonce="${nonce}"$1>`);

      res.removeHeader('etag');
      res.setHeader('content-length', Buffer.byteLength(body, 'utf8'));

      return originalEnd(body, 'utf8', callback);
    }
    return originalEnd(chunk, encoding, callback);
  };

  next();
}

module.exports = { cspNonceMiddleware };

