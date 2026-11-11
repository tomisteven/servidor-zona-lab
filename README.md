# Zona Lab · Backend

API de Zona Lab: catálogo, cotizaciones, pedidos, archivos y panel administrativo. Node.js + Express 5, MongoDB/Mongoose y JavaScript.

Este repositorio contiene únicamente el backend. El frontend vive en un repositorio y despliegue independiente.

## Requisitos

- Node.js 24 (ver `.nvmrc`).
- npm 10 o superior.
- MongoDB local o MongoDB Atlas.

## Instalación

```bash
npm install
cp .env.example .env
```

En PowerShell/Windows:

```powershell
Copy-Item .env.example .env
```

Completar `MONGODB_URI` y `WHATSAPP_NUMBER`. Nunca commitear `.env`.

## Variables de entorno

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

| Variable              | Obligatoria | Uso                                                   |
| --------------------- | ----------- | ----------------------------------------------------- |
| `NODE_ENV`            | No          | `development`, `test` o `production`.                 |
| `PORT`                | No          | Puerto HTTP; por defecto `5050`.                      |
| `MONGODB_URI`         | Sí          | URI `mongodb://` o `mongodb+srv://`.                  |
| `CORS_ORIGINS`        | No          | Orígenes del frontend, separados por coma. Sin `*`.   |
| `LOG_LEVEL`           | No          | Nivel de Pino; por defecto `info`.                    |
| `WHATSAPP_NUMBER`     | Sí          | Número por defecto, 10 a 15 dígitos.                  |
| `COOKIE_SAME_SITE`    | No          | `lax`, `strict` o `none`; por defecto `lax`.          |
| `TRUST_PROXY`         | No          | `true` si corre detrás de un proxy HTTPS.             |
| `ADMIN_EMAIL`         | Condicional | Correo del administrador.                             |
| `ADMIN_PASSWORD_HASH` | Condicional | Hash generado con `npm run admin:hash`.               |
| `SESSION_SECRET`      | Condicional | Secreto de 32 caracteres o más para firmar la sesión. |

En producción, las tres variables admin son obligatorias.

## Panel administrativo

```bash
npm run admin:hash -- "una contraseña de al menos 12 caracteres"
```

Copiar el hash en `ADMIN_PASSWORD_HASH`, definir `ADMIN_EMAIL` y generar `SESSION_SECRET` con un CSPRNG, por ejemplo:

```bash
openssl rand -base64 48
```

## Ejecución

```bash
npm run dev
```

- API: <http://localhost:5050>
- Salud: <http://localhost:5050/api/health>
- Preparación con MongoDB: <http://localhost:5050/api/health/ready>

## Scripts

| Comando                | Descripción                            |
| ---------------------- | -------------------------------------- |
| `npm run dev`          | Ejecuta Node con recarga automática.   |
| `npm start`            | Ejecuta el servidor.                   |
| `npm test`             | Pruebas con `node:test`.               |
| `npm run test:watch`   | Pruebas en modo watch.                 |
| `npm run lint`         | ESLint.                                |
| `npm run format`       | Formatea con Prettier.                 |
| `npm run format:check` | Verifica formato.                      |
| `npm run verify`       | Lint y pruebas.                        |
| `npm run admin:hash`   | Genera el hash de la contraseña admin. |

No hay etapa de build: Node ejecuta directamente los módulos ES.

## API

Rutas públicas:

- `GET /api/health`, `GET /api/health/ready`
- `GET /api/catalog/categories`, `GET /api/catalog/products`, `GET /api/catalog/products/:slug`
- `GET /api/settings/public`
- `POST /api/quotes/estimate`, `POST /api/quotes`

Rutas administrativas:

- `/api/admin/auth/*`
- `/api/admin/products*`
- `/api/admin/quotes*`
- `/api/admin/settings`
- `/api/admin/uploads/media`

Los precios siempre se calculan en el servidor. El frontend no define precios ni totales.

## Archivos

- `storage/media`: imágenes públicas, servidas en `/uploads/media`.
- `storage/logos`: archivos privados de pedidos.

En producción, montar un volumen persistente y respaldar ambos directorios. Los archivos no se guardan en Git.

## Despliegue

1. Definir `NODE_ENV=production` y todas las variables en el proveedor.
2. Configurar `CORS_ORIGINS` con el dominio exacto del frontend.
3. Servir la API bajo HTTPS.
4. Si frontend y backend están en sitios distintos, usar `COOKIE_SAME_SITE=none`.
5. Si la plataforma termina HTTPS mediante proxy, usar `TRUST_PROXY=true`.
6. Montar almacenamiento persistente para `storage/`.
7. Verificar `/api/health/ready` y los backups de MongoDB y archivos.

Con `COOKIE_SAME_SITE=none`, las cookies requieren HTTPS y el frontend debe enviar credenciales. Con `lax` alcanza para dominios del mismo sitio.

## Estructura

```text
src/
├── config/              # entorno, MongoDB y almacenamiento
├── modules/
│   ├── auth/            # sesión admin y CSRF
│   ├── catalog/         # productos y categorías
│   ├── health/
│   ├── quotes/          # pricing, pedidos y WhatsApp
│   ├── settings/        # portada y WhatsApp
│   └── uploads/         # archivos públicos y privados
├── shared/
├── app.js
└── server.js
tests/
scripts/
```

## Documentación

- [AGENTS.md](AGENTS.md): reglas de trabajo para agentes.
- [Arquitectura](docs/ARCHITECTURE.md).
- [API](docs/API.md) y [convenciones](docs/API_CONVENTIONS.md).
- [Entorno](docs/ENVIRONMENT.md).
- [Despliegue](docs/DEPLOYMENT.md).
- [Seguridad](docs/SECURITY.md).
- [Testing](docs/TESTING.md).
- [Decisiones](docs/decisions/).

## Calidad

El workflow de `.github/workflows/ci.yml` ejecuta instalación, lint, formato y pruebas. Las pruebas de integración usan `mongodb-memory-server` y no requieren una base externa.
