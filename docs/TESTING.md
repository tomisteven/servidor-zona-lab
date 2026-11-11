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
- Producto → estimación → pedido → archivos → admin.
- Autenticación, cookies, CSRF y rate limiting.
- Uploads y SVG inseguro.
- Configuración pública y administrativa.

## Pendiente

- E2E con frontend real.
- Pruebas de carga y rendimiento.
- Recuperación ante caída de MongoDB.
- Pérdida o corrupción de archivos.
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
