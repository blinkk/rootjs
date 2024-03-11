import crypto from 'crypto';

const PASSWORD_ITERATIONS = 10000;
const PASSWORD_HASH_LENGTH = 64;
const PASSWORD_DIGEST = 'sha256';

export async function hashPassword(
  password: string
): Promise<{hash: string; salt: string}> {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await generateHash(password, salt);
  return {hash, salt};
}

export async function verifyPassword(
  password: string,
  hash: string,
  salt: string
): Promise<boolean> {
  const generatedHash = await generateHash(password, salt);
  return hash === generatedHash;
}

function generateHash(password: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(
      password,
      salt,
      PASSWORD_ITERATIONS,
      PASSWORD_HASH_LENGTH,
      PASSWORD_DIGEST,
      (err, derivedKey) => {
        if (err) {
          console.error('password hashing failed');
          console.error(err);
          reject(err);
          return;
        }
        const hash = derivedKey.toString('hex');
        resolve(hash);
      }
    );
  });
}
