# Testing del backend

## Herramientas

- `node:test`.
- `node:assert/strict`.
- `mongodb-memory-server` para integración.

## Comandos

```bash
npm test
npm run test:watch
npm run lint
npm run format:check
npm run verify
```

## Capas

- **Unitarias:** pricing, auth, validadores y funciones puras.
- **Integración:** rutas HTTP, middleware, MongoDB y archivos.
- **E2E:** pendiente con frontend y navegador real.

## Prioridad

Alta:

- autenticación y CSRF;
- pricing y creación de pedidos;
- uploads y descargas privadas;
- CORS;
- validación de entorno;
- CRUD de productos.

Media:

- settings;
- paginación y búsqueda;
- salud;
- rate limiting.

Baja:

- detalles de presentación de errores no críticos.

## Reglas de aislamiento

- No usar producción ni datos reales.
- Usar `mongodb-memory-server`.
- Crear datos deterministas por prueba.
- Limpiar sin borrar recursos ajenos.
- No depender del orden de ejecución.
- Mockear servicios externos cuando no se prueba la integración.

## Cobertura actual

- Validación y normalización de entorno.
- Salud y readiness.
- CORS permitido/rechazado.
- 404, JSON malformado y errores centralizados.
- Pricing: tramos, mínimos, opciones y `custom`.
- Producto → estimación → pedido → archivos → admin, incluyendo edición, baja lógica y `customReason`.
- Autenticación, cookies y CSRF.
- Rate limiting en login.
- Uploads: firmas binarias, SVG seguro e inseguro, sanitización de nombres y path traversal.
- Validación de producto: tramos desordenados/superpuestos y grupos u opciones duplicadas.
- Límite del campo `payload` en pedidos.
- Media pública: subida, servido estático, borrado y protección de imágenes en uso.
- Configuración pública y administrativa.
- Configuración SMTP cifrada, exclusión de secretos en la API pública y correo de prueba.
- Estado y notas internas de pedidos.
- Atribución UTM/marketing en pedidos.
- Formulario de contacto, dashboard y auditoría administrativa.
- Reseñas públicas, moderación y resumen de rating.
- Exportación CSV, anonimización y borrado de pedidos.
- Biblioteca de medios, variantes responsive y protección de imágenes en uso.
- Cifrado AES-256-GCM de secretos y notificaciones de pedidos escapadas.
- Scripts de seed, optimización de media, limpieza y backup se validan manualmente en desarrollo.

## Pendiente

- E2E con frontend real.
- Pruebas de carga y rendimiento.
- Rate limiting con almacenamiento compartido entre instancias.
- Sanitizador SVG dedicado en lugar de patrones.
- Recuperación ante caída de MongoDB.
- Pérdida o corrupción de archivos.
- Programación automática de `media:cleanup` y verificación de backups.
- Umbral de cobertura basado en riesgo.
- Análisis de dependencias en CI.

## CI

`.github/workflows/ci.yml` ejecuta:

```bash
npm ci
npm run lint
npm run format:check
npm test
```

Las pruebas de integración descargan el binario de MongoDB en memoria; el runner necesita acceso de red la primera vez.
