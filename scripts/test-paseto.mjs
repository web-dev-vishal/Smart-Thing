import { V4 } from 'paseto';
import { createPublicKey } from 'crypto';

// generateKey returns the PRIVATE key only
const privateKey = await V4.generateKey('public');
console.log('private key type:', privateKey.asymmetricKeyType);

// Derive the public key from the private key
const publicKey = createPublicKey(privateKey);
console.log('public key type:', publicKey.asymmetricKeyType);

// Export both as bytes
const privateBytes = V4.keyObjectToBytes(privateKey);
const publicBytes  = V4.keyObjectToBytes(publicKey);
console.log('private bytes length:', privateBytes.length); // should be 64
console.log('public bytes length:', publicBytes.length);   // should be 32

// Test sign/verify with ISO string exp
const now = new Date();
const exp = new Date(now.getTime() + 15 * 60 * 1000).toISOString(); // 15 min from now
const payload = { sub: 'user123', exp, typ: 'access' };

const token = await V4.sign(payload, privateKey);
console.log('token prefix:', token.slice(0, 20));

// Verify with public key
const verified = await V4.verify(token, publicKey);
console.log('verified sub:', verified.sub);
console.log('verified typ:', verified.typ);
console.log('SUCCESS');
