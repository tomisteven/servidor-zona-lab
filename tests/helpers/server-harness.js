import { once } from 'node:events';

export async function startTestServer(app) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('No se pudo obtener la dirección del servidor de prueba.');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });

        server.closeAllConnections?.();
      });
    },
  };
}
