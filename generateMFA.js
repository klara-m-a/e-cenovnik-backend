console.log('Starting MFA generation');
const speakeasy = require('speakeasy');

const secret = speakeasy.generateSecret({ name: 'e-cenovnik.mk (admin)' });
console.log('Your MFA secret (base32) is:', secret.base32);
console.log('QR Code URL (optional):', secret.otpauth_url);
