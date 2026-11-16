# Arquitectura del backend

## Objetivo

API HTTP para el sitio comercial y el panel operativo de Zona Lab. Es un monolito modular: una sola aplicación con módulos de negocio delimitados, desplegable de forma independiente del frontend.

## Alcance

- Catálogo público.
- Configuración pública del sitio.
- Cotización y registro de pedidos.
- Archivos públicos y privados.
- Autenticación administrativa.
- CRUD de productos, pedidos y configuración.

No incluye frontend, SSR, pagos, stock, envíos, facturación ni trabajos en segundo plano.

## Estructura

```text
src/
├── config/
│   ├── env.js
│   ├── validate-environment.js
│   ├── database.js
│   └── storage.js
├── modules/
│   ├── auth/
│   ├── catalog/
│   ├── health/
│   ├── notifications/
│   ├── quotes/
│   ├── settings/
│   └── uploads/
├── shared/
│   ├── errors/
│   ├── http/
│   └── logger.js
├── app.js
└── server.js
```

## Módulos

| Módulo          | Responsabilidad                                                               |
| --------------- | ----------------------------------------------------------------------------- |
| `health`        | Estado del proceso y de MongoDB.                                              |
| `catalog`       | Productos, categorías, tramos, opciones, serialización y CRUD administrativo. |
| `settings`      | Portada y WhatsApp; configuración pública y administrativa.                   |
| `quotes`        | Estimación, selecciones, pricing, pedidos, seguimiento, archivos y WhatsApp.  |
| `auth`          | Login, cookies, expiración, autorización y CSRF.                              |
| `uploads`       | Multer, validación por firma, optimización, sanitización y almacenamiento.    |
| `notifications` | Emails de pedidos, cambios de estado, contacto y prueba SMTP.                 |
| `contact`       | Formulario público de consultas con rate limit.                               |
| `dashboard`     | Métricas agregadas para el panel.                                             |
| `audit`         | Registro de mutaciones administrativas.                                       |
| `reviews`       | Reseñas de producto, moderación y resumen de rating.                          |

`quotes` consume lectura activa de `catalog` y resolución de WhatsApp de `settings`; no accede a detalles HTTP de esos módulos.

## Flujo HTTP

```text
Request
  → logger/request id
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

`app.js` recibe logger, CORS, estado de base, WhatsApp, auth, storage, rate limiting y `trustProxy` por inyección para facilitar pruebas.

## Modelo de datos

### Product

- `name`, `slug` único, `category`, `shortDescription`, `seoTitle`, `seoDescription`, `description`, `features`.
- `imageUrl` como portada, `imageAlt` como texto alternativo, `images` como galería (máximo 10), `active`, `minimumQuantity`, `personalizationFee`.
- `priceTiers`: `minQuantity`, `maxQuantity`, `unitPrice`.
- `optionGroups`: `name`, `required`, `choices` con `label` y `additionalUnitPrice`.
- `deletedAt` para baja lógica.

### QuoteRequest

- `code`: `ZL-YYYYMMDD-<10 hex>`.
- `status`: `new`, `contacted` o `closed`; `adminNotes` para seguimiento interno.
- Snapshot de producto, cantidad, selecciones, notas y datos del cliente.
- `pricing`: snapshot autoritativo con estado `estimated` o `custom`.
- `logo` y `reference`: metadatos privados; nunca exponer la ruta física.
- `marketing`: atribución UTM y referrer del pedido.
- `whatsappNumber` y `whatsappUrl`.

### SiteSettings

Documento único con `key: 'main'`: WhatsApp, portada, título, subtítulo y configuración SMTP. La contraseña de aplicación se guarda cifrada. Si no existe, se devuelven valores por defecto sin crear el documento.

### Review

- `productId`, `productName` y `productSlug` como snapshot del producto.
- `name`, `rating` (1 a 5), `comment` y `approved`.
- Las reseñas nuevas se crean con `approved: false` y solo se publican tras moderación.

## Datos personales

- `POST /api/admin/quotes/:id/anonymize` elimina nombre, marca, contacto, observaciones, notas de diseño y archivos del pedido.
- `DELETE /api/admin/quotes/:id` elimina el pedido y sus archivos de forma definitiva.
- Ambas acciones requieren sesión administrativa y CSRF.

## Pricing

`resolveSelections` valida grupos y opciones, evita duplicados y exige grupos obligatorios. `calculateQuotePricing`:

1. Rechaza cantidades menores a `minimumQuantity`.
2. Busca un tramo inclusivo.
3. Si no hay tramo, devuelve `custom` sin inventar precio.
4. Si hay tramo: `unitBasePrice + adicionales`, por cantidad, más `personalizationFee`.
5. Redondea a dos decimales en ARS.

La estimación y el pedido ejecutan la misma lógica.

## Autenticación

- Contraseña con scrypt y comparación de tiempo constante.
- Sesión sin estado: token HMAC-SHA256 con email, CSRF y expiración.
- TTL de 8 horas.
- Cookie de sesión HttpOnly.
- Cookie CSRF legible por el cliente.
- `SameSite` configurable con `COOKIE_SAME_SITE`.
- `Secure` en producción.
- CSRF obligatorio en mutaciones admin.
- Login limitado a 5 intentos cada 15 minutos por IP.

## CORS y cookies

- Orígenes explícitos, sin comodines.
- `credentials: true`.
- `COOKIE_SAME_SITE=lax` para mismo sitio.
- `COOKIE_SAME_SITE=none` para frontend y backend en sitios distintos, siempre con HTTPS.
- `TRUST_PROXY=true` cuando la plataforma termina HTTPS.

## Errores

- `AppError` para errores esperables.
- Middleware central traduce y oculta detalles internos.
- Contrato:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Revisá los datos enviados.",
    "details": []
  }
}
```

- No exponer stack traces, rutas físicas ni mensajes de MongoDB.

## Archivos

- `storage/media`: imágenes públicas, servidas en `/uploads/media`.
- Las variantes WebP de 480, 960 y 1600 px se generan desde `?w=<ancho>` y se cachean en la misma carpeta con sufijo `-<ancho>.webp`.
- Con Cloudinary configurado, las imágenes se replican en la nube y `/uploads/media/...` redirige a `res.cloudinary.com`; la copia local queda como respaldo.
- `storage/logos`: archivos privados de pedidos.
- Las imágenes públicas sin referencias pueden eliminarse desde el panel o con `npm run media:cleanup -- --apply`; al borrar un original se eliminan sus variantes.
- Multer en memoria.
- Validación por firma binaria.
- Nombres UUID.
- SVG limitado y filtrado.
- Media hasta 8 MB.
- Archivos de pedido hasta 10 MB.
- En producción, volumen persistente y backup.

## Observabilidad

- Pino con logs JSON.
- `x-request-id`.
- La ruta registrada excluye query params.
- Se redactan cookies, autorización y `set-cookie`.
- No se registran contraseñas, tokens ni payloads sensibles.
- Sin métricas, tracing ni alertas externas todavía.

## Escalabilidad

- Consultas paginadas e índices justificados.
- Archivos servidos por Express; evaluar object storage/CDN si crece el volumen.
- Monolito modular antes que microservicios.
- Medir antes de optimizar.

## Límites conocidos

- Una sola cuenta administrativa.
- Sin recuperación de contraseña ni revocación individual.
- Sin envío automático de archivos por WhatsApp.
- Sin pagos, stock, envíos ni facturación.
- Sin trabajos en segundo plano, caché distribuida ni object storage.
- Sin migraciones formales.
- Sin E2E automatizado.
