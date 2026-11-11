# AGENTS.md — Zona Lab Backend

## Contexto del repositorio

Este repositorio contiene únicamente la API de Zona Lab: catálogo, cotizaciones, pedidos, archivos, configuración y panel administrativo. El frontend vive en otro repositorio y se despliega por separado.

Stack: Node.js 24, Express 5, MongoDB/Mongoose 9, Zod, Multer, Pino, JavaScript con ES Modules.

No reintroducir el monorepo ni npm workspaces. Este proyecto debe funcionar de forma independiente con su propio `package.json`, lockfile, configuración y CI.

## Objetivo funcional

- Exponer catálogo y configuración pública.
- Calcular precios de forma autoritativa en el servidor.
- Registrar pedidos con archivos privados.
- Generar el mensaje y la URL de WhatsApp.
- Autenticar al administrador y permitir CRUD de productos, pedidos y configuración.

## Reglas no negociables

1. **Entender antes de cambiar:** leer este archivo, `README.md`, `docs/` y el módulo afectado.
2. **Cambios acotados:** implementar la solución mínima coherente; no reescribir módulos ajenos.
3. **JavaScript solamente:** no introducir TypeScript ni archivos `.ts`.
4. **Precios en servidor:** ninguna ruta acepta precios, totales o descuentos calculados por el cliente.
5. **Sin precio inventado:** si no hay tramo publicado, el resultado es `custom`; no usar un fallback arbitrario.
6. **Autorización en servidor:** el frontend nunca es una frontera de seguridad.
7. **Validación en límites:** validar `params`, `query`, `body`, archivos y variables de entorno.
8. **Seguridad por defecto:** mínimo privilegio, secretos fuera del repositorio y errores sin detalles internos.
9. **Sin operaciones destructivas:** no borrar datos, resetear bases ni ejecutar migraciones destructivas sin autorización.
10. **Calidad demostrable:** no declarar pruebas o lint exitosos sin ejecutarlos.
11. **Sin comentarios innecesarios:** no agregar comentarios al código salvo que expliquen una decisión no obvia.
12. **Contratos estables:** no romper `docs/API.md` sin evaluar compatibilidad y documentar la transición.

## Antes de implementar

Identificar:

- módulo, ruta, servicio, modelo y esquema afectados;
- reglas de negocio y validaciones;
- permisos, cookies y CSRF;
- impacto en MongoDB, índices y archivos;
- variables de entorno nuevas;
- pruebas existentes y pruebas necesarias.

Para cambios pequeños y claros, proceder directamente. Para cambios transversales, sensibles o ambiguos, presentar un plan breve antes de editar.

## Arquitectura

Monolito modular con límites por dominio. No crear microservicios, colas ni almacenamiento de objetos por anticipado.

```text
src/
├── config/
│   ├── env.js                 # carga y validación de entorno
│   ├── validate-environment.js
│   ├── database.js            # conexión MongoDB
│   └── storage.js             # rutas de archivos
├── modules/
│   ├── auth/                  # login, sesión HMAC y CSRF
│   ├── catalog/               # productos, categorías y CRUD admin
│   ├── health/
│   ├── quotes/                # pricing, pedidos, WhatsApp y archivos privados
│   ├── settings/              # portada y WhatsApp
│   └── uploads/               # Multer, validación y almacenamiento
├── shared/
│   ├── errors/
│   ├── http/                  # errores, validación, rate limit
│   └── logger.js
├── app.js                     # composición de Express
└── server.js                  # arranque y apagado
```

Reglas de dependencia:

- `modules` puede importar `shared` y utilidades estables.
- `shared` no debe importar módulos de negocio.
- `quotes` puede consumir lectura de `catalog` y resolución de `settings`; no debe depender de detalles HTTP de esos módulos.
- Evitar dependencias circulares.
- Los modelos Mongoose no deben contener lógica HTTP.

## Flujo HTTP

```text
Request
  → request id y logs
  → helmet y CORS
  → body limit y parseo
  → router del módulo
  → auth/CSRF si es admin
  → validación Zod
  → controlador
  → servicio de dominio
  → Mongoose o filesystem
  → DTO explícito
  → respuesta o error centralizado
```

## Módulos y responsabilidades

| Módulo     | Responsabilidad                                                                  |
| ---------- | -------------------------------------------------------------------------------- |
| `health`   | Estado del proceso y de MongoDB.                                                 |
| `catalog`  | Productos, categorías, tramos, opciones, serialización y CRUD administrativo.    |
| `settings` | Portada y WhatsApp; configuración pública y administrativa.                      |
| `quotes`   | Estimación, selecciones, pricing, pedidos, archivos privados y mensaje WhatsApp. |
| `auth`     | Login, cookies, expiración, autorización y CSRF.                                 |
| `uploads`  | Multer, validación por firma, sanitización y almacenamiento de archivos.         |

## Modelo de datos

### Product

- `name`, `slug` único, `category`, `shortDescription`, `description`, `features`.
- `imageUrl`, `active`, `minimumQuantity`, `personalizationFee`.
- `priceTiers`: `minQuantity`, `maxQuantity`, `unitPrice`.
- `optionGroups`: `name`, `required`, `choices` con `label` y `additionalUnitPrice`.
- `deletedAt` para baja lógica.

Reglas:

- El slug es opcional al crear; se genera desde el nombre y debe ser único.
- Los tramos no pueden superponerse y solo el último puede quedar abierto.
- Cada grupo necesita al menos una opción.
- Nombres de grupos y labels de opciones no se repiten dentro de su alcance.
- La baja es lógica: desactiva y marca `deletedAt`.

### QuoteRequest

- `code`: `ZL-YYYYMMDD-<10 hex>`.
- Snapshot de producto, cantidad, selecciones, notas y datos del cliente.
- `pricing`: snapshot autoritativo con estado `estimated` o `custom`.
- `logo` y `reference`: metadatos privados; nunca exponer la ruta física.
- `whatsappNumber` y `whatsappUrl`.
- Los snapshots evitan que un pedido cambie cuando se edita el producto.

### SiteSettings

Documento único con `key: 'main'`: WhatsApp, portada, título y subtítulo. Si no existe, devolver valores por defecto sin crear el documento.

## Pricing

`resolveSelections` valida grupos y opciones, evita selecciones duplicadas del mismo grupo y exige los grupos obligatorios. `calculateQuotePricing`:

1. Rechaza cantidades menores a `minimumQuantity`.
2. Busca un tramo inclusivo.
3. Si no hay tramo, devuelve `custom` sin inventar precio.
4. Si hay tramo: `unitBasePrice + suma de adicionales`, multiplicado por cantidad, más `personalizationFee`.
5. Redondea a dos decimales en ARS.

La estimación y la creación del pedido deben ejecutar la misma lógica.

## Autenticación y autorización

- Contraseña admin con scrypt y comparación de tiempo constante.
- Sesión sin estado: token HMAC-SHA256 con email, CSRF y expiración.
- TTL de sesión: 8 horas.
- Cookie `zl_admin_session` HttpOnly.
- Cookie `zl_admin_csrf` legible por el cliente.
- `SameSite` configurable con `COOKIE_SAME_SITE`; `Secure` en producción.
- CSRF obligatorio en mutaciones admin mediante `x-csrf-token`.
- Login limitado a 5 intentos cada 15 minutos por IP.
- Rutas admin siempre protegidas con `requireAdmin` y `requireCsrf`.

## Validación y errores

- Zod en todos los límites HTTP.
- Validación adicional de reglas de negocio en servicios.
- No aceptar filtros u operadores Mongo arbitrarios.
- Serializar respuestas explícitamente; no devolver documentos Mongoose crudos.
- Usar `AppError` para errores esperables.
- No exponer stack traces, rutas físicas, mensajes internos de MongoDB ni secretos.
- Mantener el contrato de error:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Revisá los datos enviados.",
    "details": []
  }
}
```

## Archivos

- `storage/media`: imágenes públicas, servidas en `/uploads/media`.
- `storage/logos`: archivos privados de pedidos.
- Multer en memoria; validar por firma binaria, no solo por MIME declarado.
- Nombres UUID y extensión segura.
- SVG: máximo 2 MB y filtrado contra scripts, eventos y referencias externas.
- Media: PNG/JPG/WEBP hasta 8 MB.
- Archivos de pedido: PNG/JPG/WEBP/SVG/PDF hasta 10 MB.
- No guardar archivos en Git.
- En producción, montar volumen persistente y respaldar ambos directorios.

## Configuración

Variables principales:

```dotenv
NODE_ENV=development
PORT=5050
MONGODB_URI=mongodb://127.0.0.1:27017/zona_lab_dev
CORS_ORIGINS=http://localhost:8080
LOG_LEVEL=info
WHATSAPP_NUMBER=5491112345678
COOKIE_SAME_SITE=lax
TRUST_PROXY=false
ADMIN_EMAIL=
ADMIN_PASSWORD_HASH=
SESSION_SECRET=
```

Reglas:

- `MONGODB_URI` y `WHATSAPP_NUMBER` son obligatorios.
- En producción, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` y `SESSION_SECRET` son obligatorios.
- `COOKIE_SAME_SITE=none` requiere HTTPS y se usa cuando frontend y backend están en sitios distintos.
- `TRUST_PROXY=true` cuando la plataforma termina HTTPS mediante proxy.
- `CORS_ORIGINS` no admite comodines.
- No commitear `.env` ni imprimir secretos.
- Actualizar `.env.example` y `docs/ENVIRONMENT.md` al agregar variables.

## Comandos reales

```bash
npm ci
npm run dev
npm start
npm test
npm run test:watch
npm run lint
npm run format
npm run format:check
npm run verify
npm run admin:hash -- "contraseña de al menos 12 caracteres"
```

Puertos locales: API `5050`, frontend `8080`.

## Pruebas

- Framework: `node:test` y `node:assert/strict`.
- Integración con `mongodb-memory-server`; no usar producción ni datos reales.
- Cubrir autenticación, CSRF, CORS, validación, pricing, pedidos, archivos y configuración.
- No depender del orden de ejecución.
- Limpiar datos de prueba sin borrar recursos ajenos.
- Agregar pruebas unitarias para reglas puras y de integración para contratos HTTP.
- No declarar cobertura sin medirla.

## Seguridad

- Mínimo privilegio y autorización por recurso.
- Rate limits en login, estimación y creación de pedidos.
- Helmet y límite de payload de `100kb`.
- CORS con credenciales y orígenes explícitos.
- Logs con redacción de cookies, autorización y `set-cookie`; no registrar contraseñas, tokens ni datos sensibles.
- Validar archivos por contenido.
- No servir `storage/logos` como estático.
- Revisar dependencias y configuración antes de producción.
- Documentar backups y recuperación.

## Despliegue

1. Definir `NODE_ENV=production` y todas las variables en el proveedor.
2. Configurar `CORS_ORIGINS` con el dominio exacto del frontend.
3. Servir bajo HTTPS.
4. Configurar `COOKIE_SAME_SITE=none` si frontend y backend están en sitios distintos.
5. Configurar `TRUST_PROXY=true` si hay proxy HTTPS.
6. Montar volumen persistente para `storage/`.
7. Verificar `/api/health/ready`.
8. Respaldar MongoDB y archivos de forma coordinada.

## Documentación

Mantener actualizado:

- `README.md`: instalación, scripts y despliegue.
- `docs/API.md`: contratos y códigos de error.
- `docs/API_CONVENTIONS.md`: convenciones para evolución de contratos.
- `docs/ARCHITECTURE.md`: módulos, flujos y modelo de datos.
- `docs/ENVIRONMENT.md`: variables y configuración.
- `docs/DEPLOYMENT.md`: operación y despliegue.
- `docs/SECURITY.md`: controles y pendientes.
- `docs/TESTING.md`: estrategia y comandos.
- `docs/decisions/`: ADR para decisiones relevantes.

## Definición de terminado

- El cambio cumple el objetivo y respeta los límites de módulos.
- Se ejecutaron `npm run lint`, `npm test` y `npm run format:check`.
- Se agregaron o actualizaron pruebas cuando cambió comportamiento.
- No hay secretos, archivos subidos ni artefactos generados en el diff.
- La documentación refleja cambios de API, esquema, entorno o despliegue.
- Se informó qué se cambió, qué se verificó y qué quedó pendiente.

## Limitaciones conocidas

- Una sola cuenta administrativa por entorno.
- Sin recuperación de contraseña ni revocación individual de sesiones.
- Sin envío automático de archivos por WhatsApp.
- Sin pagos, stock, envíos ni facturación.
- Sin trabajos en segundo plano, caché distribuida ni almacenamiento de objetos.
- Sin migraciones formales; los cambios de esquema deben ser compatibles o documentarse en un ADR.
- Sin E2E automatizado entre navegador real y backend.
