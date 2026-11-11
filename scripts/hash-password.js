import { hashPassword } from '../src/modules/auth/password.js';

const password = process.argv[2];

if (!password || password.length < 12) {
  console.error('Uso: npm run admin:hash -- "contraseña de al menos 12 caracteres"');
  process.exit(1);
}

const hash = await hashPassword(password);
console.log(hash);
