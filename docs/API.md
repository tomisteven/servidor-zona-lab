# Contratos de API

Base URL local: `http://localhost:5050/api`

Todas las respuestas incluyen `x-request-id`. Las rutas administrativas requieren sesión y, en mutaciones, CSRF.

## Salud

### GET /api/health

Verifica que el proceso HTTP está activo. No requiere autenticación.

```json
{
  "status": "ok",
  "service": "zona-lab-api",
  "uptimeSeconds": 42
}
```

### GET /api/health/ready

Incluye el estado de MongoDB. Responde `200` si está listo y `503` si no.

```json
{
  "status": "ready",
  "checks": {
    "database": "connected"
  }
}
```

Valores de `database`: `connected`, `connecting`, `disconnected`, `disconnecting`, `unknown`.

## Catálogo público

### GET /api/catalog/categories

Devuelve las categorías disponibles.

```json
{
  "items": [{ "value": "mochilas", "label": "Mochilas" }]
}
```

### GET /api/catalog/products

Lista productos activos y no eliminados.

Query params:

| Parámetro  | Tipo   | Default | Límites             |
| ---------- | ------ | ------- | ------------------- |
| `page`     | entero | `1`     | `1..100000`         |
| `limit`    | entero | `12`    | `1..24`             |
| `category` | enum   | —       | Categoría válida    |
| `search`   | string | —       | Hasta 80 caracteres |

Respuesta:

```json
{
  "items": [
    {
      "id": "665f...",
      "name": "Bolso urbano",
      "slug": "bolso-urbano",
      "category": "bolsos",
      "categoryLabel": "Bolsos",
      "shortDescription": "Bolso personalizado",
      "imageUrl": "/uploads/media/archivo.webp",
      "minimumQuantity": 10,
      "startingUnitPrice": 12500
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 12,
    "total": 1,
    "totalPages": 1
  }
}
```

### GET /api/catalog/products/:slug

Devuelve el detalle público de un producto activo.

```json
{
  "product": {
    "id": "665f...",
    "name": "Bolso urbano",
    "slug": "bolso-urbano",
    "category": "bolsos",
    "categoryLabel": "Bolsos",
    "shortDescription": "Bolso personalizado",
    "imageUrl": "",
    "minimumQuantity": 10,
    "startingUnitPrice": 12500,
    "description": "Descripción completa",
    "features": ["Material resistente"],
    "personalizationFee": 5000,
    "priceTiers": [{ "minQuantity": 10, "maxQuantity": 49, "unitPrice": 12500 }],
    "optionGroups": [
      {
        "id": "665f...",
        "name": "Color",
        "required": true,
        "choices": [{ "id": "665f...", "label": "Negro", "additionalUnitPrice": 0 }]
      }
    ]
  }
}
```

Códigos de error: `404 PRODUCT_NOT_FOUND`.

## Configuración pública

### GET /api/settings/public

Devuelve la configuración editable del sitio, usando los valores por defecto cuando todavía no se guardó nada.

```json
{
  "settings": {
    "whatsappNumber": "5491112345678",
    "heroTitle": "CREÁ TU PROPIA LÍNEA DE BOLSOS.",
    "heroSubtitle": "Personalizá bolsos, mochilas y accesorios...",
    "heroImageUrl": "",
    "updatedAt": null
  }
}
```

## Cotizador público

### POST /api/quotes/estimate

Calcula el precio en el servidor. Límite: 120 solicitudes cada 15 minutos por IP.

Request:

```json
{
  "productId": "665f...",
  "quantity": 20,
  "selections": [{ "groupId": "665f...", "choiceId": "665f..." }]
}
```

Respuesta:

```json
{
  "estimate": {
    "product": {
      "id": "665f...",
      "name": "Bolso urbano",
      "slug": "bolso-urbano",
      "minimumQuantity": 10
    },
    "quantity": 20,
    "selections": [
      {
        "groupId": "665f...",
        "groupName": "Color",
        "choiceId": "665f...",
        "choiceLabel": "Negro",
        "additionalUnitPrice": 0
      }
    ],
    "pricing": {
      "status": "estimated",
      "tier": { "minQuantity": 10, "maxQuantity": 49 },
      "unitBasePrice": 12500,
      "optionsUnitTotal": 0,
      "unitPrice": 12500,
      "personalizationFee": 5000,
      "estimatedTotal": 255000,
      "currency": "ARS",
      "computedAt": "2026-10-22T12:00:00.000Z"
    }
  }
}
```

Si la cantidad no tiene tramo publicado, `pricing.status` es `custom`, los importes son `null` y `customReason` explica el motivo.

Fórmula: `unitPrice * quantity + personalizationFee`, donde `unitPrice = unitBasePrice + optionsUnitTotal`.

Códigos de error frecuentes: `MINIMUM_QUANTITY`, `INVALID_SELECTION`, `REQUIRED_OPTION_MISSING`, `PRODUCT_NOT_FOUND`, `RATE_LIMITED`.

### POST /api/quotes

Registra un pedido. Límite: 20 solicitudes por hora por IP. Formato `multipart/form-data`.

Campos:

| Campo       | Tipo | Obligatorio | Límite                                |
| ----------- | ---- | ----------- | ------------------------------------- |
| `payload`   | JSON | Sí          | Mismo contrato del estimate + cliente |
| `logo`      | file | No          | PNG/JPG/WEBP/SVG/PDF, hasta 10 MB     |
| `reference` | file | No          | PNG/JPG/WEBP/SVG/PDF, hasta 10 MB     |

El JSON de `payload` agrega:

```json
{
  "designNotes": "Logo centrado",
  "customer": {
    "name": "Ana Pérez",
    "brandName": "Marca Demo",
    "phone": "+54 9 11 1234 5678",
    "email": "ana@example.com",
    "observations": "Entregar en octubre"
  }
}
```

`designNotes` admite hasta 2000 caracteres; `observations`, hasta 1000. El teléfono debe tener entre 6 y 15 dígitos.

Respuesta `201`:

```json
{
  "quote": {
    "id": "665f...",
    "code": "ZL-20261022-ABCDEF1234",
    "createdAt": "2026-10-22T12:00:00.000Z",
    "product": { "id": "665f...", "name": "Bolso urbano", "slug": "bolso-urbano" },
    "quantity": 20,
    "pricing": { "status": "estimated", "estimatedTotal": 255000, "currency": "ARS" },
    "files": { "logo": true, "reference": false }
  },
  "whatsappUrl": "https://wa.me/5491112345678?text=..."
}
```

Los archivos privados no se adjuntan automáticamente: el mensaje de WhatsApp indica que deben enviarse manualmente.

Códigos de error frecuentes: `VALIDATION_ERROR`, `FILE_REQUIRED`, `UNSUPPORTED_FILE_TYPE`, `UNSAFE_FILE`, `FILE_TOO_LARGE`, `RATE_LIMITED`, `WHATSAPP_NOT_CONFIGURED`.

## Autenticación administrativa

### POST /api/admin/auth/login

Límite: 5 intentos cada 15 minutos por IP.

```json
{ "email": "admin@example.com", "password": "contraseña" }
```

Respuesta `200`:

```json
{
  "user": { "email": "admin@example.com" },
  "csrfToken": "token",
  "expiresAt": 1790000000000
}
```

Establece `zl_admin_session` (HttpOnly) y `zl_admin_csrf`. La sesión dura 8 horas. Si el panel está deshabilitado responde `503 ADMIN_NOT_CONFIGURED`; las credenciales inválidas responden `401 INVALID_CREDENTIALS`.

### GET /api/admin/auth/session

Requiere sesión. Devuelve usuario, CSRF y expiración. `401 AUTH_REQUIRED` si no hay sesión válida.

### POST /api/admin/auth/logout

Requiere sesión y header `x-csrf-token`. Responde `204` y limpia las cookies.

## Administración

Todas las rutas siguientes requieren `zl_admin_session`. Los métodos `POST`, `PUT`, `PATCH` y `DELETE` requieren además `x-csrf-token` con el valor de la cookie `zl_admin_csrf`. Las respuestas llevan `Cache-Control: no-store`.

## Productos

| Método   | Ruta                             | Descripción                                 |
| -------- | -------------------------------- | ------------------------------------------- |
| `GET`    | `/api/admin/products`            | Lista productos, incluidos inactivos.       |
| `POST`   | `/api/admin/products`            | Crea un producto.                           |
| `GET`    | `/api/admin/products/:id`        | Obtiene un producto.                        |
| `PUT`    | `/api/admin/products/:id`        | Reemplaza los datos editables del producto. |
| `PATCH`  | `/api/admin/products/:id/status` | Activa o desactiva: `{ "active": true }`.   |
| `DELETE` | `/api/admin/products/:id`        | Baja lógica: desactiva y marca `deletedAt`. |

`GET /api/admin/products` acepta `page`, `limit` (máximo 100), `category` y `search`.

Payload de creación/edición:

```json
{
  "name": "Bolso urbano",
  "slug": "bolso-urbano",
  "category": "bolsos",
  "shortDescription": "Bolso personalizado",
  "description": "Descripción completa",
  "features": ["Material resistente"],
  "imageUrl": "/uploads/media/archivo.webp",
  "active": true,
  "minimumQuantity": 10,
  "personalizationFee": 5000,
  "priceTiers": [{ "minQuantity": 10, "maxQuantity": 49, "unitPrice": 12500 }],
  "optionGroups": [
    {
      "name": "Color",
      "required": true,
      "choices": [{ "label": "Negro", "additionalUnitPrice": 0 }]
    }
  ]
}
```

Reglas: el slug es opcional al crear (se genera desde el nombre) y único; los tramos no pueden superponerse y solo el último puede quedar abierto; cada grupo necesita al menos una opción y los nombres/labels no se repiten dentro de su alcance.

Códigos: `VALIDATION_ERROR`, `PRODUCT_NOT_FOUND`, `SLUG_TAKEN`.

## Pedidos

### GET /api/admin/quotes

Query params: `page` (default `1`), `limit` (default `20`, máximo `100`), `search` (código, cliente, teléfono o producto).

```json
{
  "items": [
    {
      "id": "665f...",
      "code": "ZL-20261022-ABCDEF1234",
      "createdAt": "2026-10-22T12:00:00.000Z",
      "product": {
        "id": "665f...",
        "name": "Bolso urbano",
        "slug": "bolso-urbano",
        "category": "bolsos"
      },
      "quantity": 20,
      "selections": [],
      "designNotes": "",
      "customer": {
        "name": "Ana",
        "brandName": "",
        "phone": "+54...",
        "email": "",
        "observations": ""
      },
      "pricing": { "status": "estimated", "estimatedTotal": 255000, "currency": "ARS" },
      "files": {
        "logo": {
          "originalName": "logo.png",
          "mimeType": "image/png",
          "sizeBytes": 1024,
          "downloadUrl": "/api/admin/quotes/665f.../files/logo"
        },
        "reference": null
      },
      "whatsappUrl": "https://wa.me/..."
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

### GET /api/admin/quotes/:id/files/:kind

Descarga un archivo privado. `kind` es `logo` o `reference`. Responde con `Content-Disposition: attachment` y `Cache-Control: private, no-store`. Códigos: `QUOTE_NOT_FOUND`, `FILE_NOT_FOUND`.

## Configuración

| Método | Ruta                  | Descripción                                   |
| ------ | --------------------- | --------------------------------------------- |
| `GET`  | `/api/admin/settings` | Obtiene la configuración actual.              |
| `PUT`  | `/api/admin/settings` | Guarda WhatsApp, portada, título y subtítulo. |

```json
{
  "whatsappNumber": "+54 9 11 1234 5678",
  "heroTitle": "Título",
  "heroSubtitle": "Subtítulo",
  "heroImageUrl": "/uploads/media/archivo.webp"
}
```

## Uploads de media

### POST /api/admin/uploads/media

`multipart/form-data` con campo `file`. Acepta PNG, JPG o WEBP de hasta 8 MB. Responde `201`:

```json
{
  "file": {
    "url": "/uploads/media/archivo.webp",
    "originalName": "portada.webp",
    "mimeType": "image/webp",
    "sizeBytes": 2048
  }
}
```

El resultado se usa como `imageUrl` de producto o `heroImageUrl`. Los archivos se sirven en `/uploads/media/<archivo>` con cache inmutable de 7 días. Si el frontend está en otro dominio, resuelve esa ruta contra `VITE_MEDIA_BASE_URL` o contra el origen de `VITE_API_BASE_URL`.

## Formato de error

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Revisá los datos enviados.",
    "details": [{ "field": "quantity", "message": "La cantidad debe ser mayor que cero." }]
  }
}
```

`details` es opcional y solo contiene información segura para el cliente.

| Código HTTP | Uso                                                     |
| ----------- | ------------------------------------------------------- |
| `400`       | Validación, JSON inválido, selección inválida.          |
| `401`       | Sesión ausente o credenciales inválidas.                |
| `403`       | CORS, CSRF o acceso no permitido.                       |
| `404`       | Recurso inexistente.                                    |
| `409`       | Conflicto de unicidad, por ejemplo slug repetido.       |
| `413`       | Payload o archivo demasiado grande.                     |
| `415`       | Tipo de archivo no permitido o SVG inseguro.            |
| `429`       | Rate limit excedido.                                    |
| `503`       | MongoDB no disponible, panel o WhatsApp sin configurar. |
| `500`       | Error inesperado, sin detalles internos.                |

## Evolución

- No modificar contratos existentes sin evaluar clientes afectados y documentar la transición.
- Aplicar las reglas de [API_CONVENTIONS.md](API_CONVENTIONS.md).
