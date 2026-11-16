import env from '../src/config/env.js';

function mask(value) {
  if (!value) {
    return '(vacío)';
  }

  if (value.length <= 6) {
    return '*'.repeat(value.length);
  }

  return `${value.slice(0, 4)}…${value.slice(-2)}`;
}

async function main() {
  console.log(`Cloudinary habilitado: ${env.cloudinaryEnabled}`);
  console.log(`Cloud name: ${env.cloudinaryCloudName || '(vacío)'}`);
  console.log(`API key: ${mask(env.cloudinaryApiKey)}`);
  console.log(`API secret: ${env.cloudinaryApiSecret.length} caracteres`);
  console.log(`Folder: ${env.cloudinaryFolder}`);

  if (!env.cloudinaryEnabled) {
    console.log('\n✗ Faltan credenciales. Completá las tres variables CLOUDINARY_*.');
    process.exitCode = 1;
    return;
  }

  const auth = Buffer.from(`${env.cloudinaryApiKey}:${env.cloudinaryApiSecret}`).toString('base64');
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(env.cloudinaryCloudName)}/resources/image?max_results=1`,
    { headers: { Authorization: `Basic ${auth}` } },
  );
  const body = await response.text();

  console.log(`Admin API: ${response.status}`);

  if (response.ok) {
    console.log('✓ Credenciales válidas.');
    return;
  }

  let message = body;

  try {
    message = JSON.parse(body)?.error?.message ?? body;
  } catch {
    // El cuerpo puede no ser JSON; se muestra tal cual.
  }

  console.log(`✗ Credenciales rechazadas: ${message.slice(0, 200)}`);
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exitCode = 1;
});
