'use strict';

const { generateTotpSecret, generateTotpCode, verifyTotpCode, getOtpAuthUrl } = require('../utils/totp');

describe('RFC 6238 TOTP Two-Factor Authentication', () => {
  it('generates a valid 32-character Base32 secret', () => {
    const secret = generateTotpSecret();
    expect(typeof secret).toBe('string');
    expect(secret.length).toBe(32);
    expect(/^[A-Z2-7]+$/.test(secret)).toBe(true);
  });

  it('generates and verifies 6-digit TOTP code successfully', () => {
    const secret = generateTotpSecret();
    const code = generateTotpCode(secret);

    expect(typeof code).toBe('string');
    expect(code).toMatch(/^\d{6}$/);

    const isValid = verifyTotpCode(code, secret);
    expect(isValid).toBe(true);
  });

  it('rejects invalid or expired TOTP codes', () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode('000000', secret)).toBe(false);
    expect(verifyTotpCode('12345', secret)).toBe(false);
    expect(verifyTotpCode('', secret)).toBe(false);
    expect(verifyTotpCode(null, secret)).toBe(false);
  });

  it('formats standard otpauth URL for QR code generation', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const url = getOtpAuthUrl({ issuer: 'Wellframe', accountName: 'admin@corp.com', secret });

    expect(url).toContain('otpauth://totp/Wellframe:admin%40corp.com');
    expect(url).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(url).toContain('algorithm=SHA1');
    expect(url).toContain('period=30');
  });
});
