import {hashPassword} from '../../core/password.js';

export async function generateHash(password: string) {
  const {hash, salt} = await hashPassword(password);
  console.log(`hash: ${hash}`);
  console.log(`salt: ${salt}`);
}
