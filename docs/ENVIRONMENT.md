# Variables de entorno del backend

## Reglas

- Mantener `.env.example` con todos los nombres y valores ficticios.
- No commitear `.env` ni variantes secretas.
- Validar al iniciar y fallar temprano ante configuración inválida.
- No imprimir secretos en logs.
- No reutilizar secretos entre desarrollo, pruebas y producción.

## Plantilla

```dotenv
NODE_ENV=development
PORT=5050
MONGODB_URI=mongodb://127.0.0.1:27017/zona_lab_dev
REDIS_URL=
CORS_ORIGINS=http://localhost:8080
LOG_LEVEL=info
WHATSAPP_NUMBER=5491112345678
COOKIE_SAME_SITE=lax
TRUST_PROXY=false

ADMIN_EMAIL=
ADMIN_PASSWORD_HASH=
SESSION_SECRET=

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_FOLDER=zona-lab/media
```

## Referencia

| Variable                | Obligatoria | Valores admitidos                                            | Default                 | Propósito                               |
| ----------------------- | ----------- | ------------------------------------------------------------ | ----------------------- | --------------------------------------- |
| `NODE_ENV`              | No          | `development`, `test`, `production`                          | `development`           | Entorno de ejecución.                   |
| `PORT`                  | No          | Entero entre 1 y 65535                                       | `5050`                  | Puerto HTTP.                            |
| `MONGODB_URI`           | Sí          | URI `mongodb://` o `mongodb+srv://`                          | —                       | Conexión a MongoDB.                     |
| `REDIS_URL`             | No          | URL `redis://` o `rediss://`                                 | —                       | Rate limit compartido entre instancias. |
| `CORS_ORIGINS`          | No          | Lista separada por comas, sin comodines                      | `http://localhost:8080` | Orígenes permitidos del frontend.       |
| `LOG_LEVEL`             | No          | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` | `info`                  | Nivel de Pino.                          |
| `WHATSAPP_NUMBER`       | Sí          | 10 a 15 dígitos; admite `+`, espacios, paréntesis y guiones  | —                       | Número por defecto para pedidos.        |
| `COOKIE_SAME_SITE`      | No          | `lax`, `strict`, `none`                                      | `lax`                   | SameSite de cookies del panel.          |
| `TRUST_PROXY`           | No          | `true`, `false`                                              | `false`                 | Confía en proxy HTTPS de la plataforma. |
| `ADMIN_EMAIL`           | Condicional | Correo válido, máximo 254 caracteres                         | —                       | Usuario del panel.                      |
| `ADMIN_PASSWORD_HASH`   | Condicional | Hash `scrypt$...` generado por el proyecto                   | —                       | Credencial; nunca texto plano.          |
| `SESSION_SECRET`        | Condicional | Mínimo 32 caracteres                                         | —                       | Firma HMAC de la sesión.                |
| `CLOUDINARY_CLOUD_NAME` | No          | Nombre del cloud de Cloudinary                               | —                       | Almacenamiento de imágenes en la nube.  |
| `CLOUDINARY_API_KEY`    | No          | API key de Cloudinary                                        | —                       | Autenticación de subida/borrado.        |
| `CLOUDINARY_API_SECRET` | No          | API secret de Cloudinary                                     | —                       | Firma de solicitudes a Cloudinary.      |
| `CLOUDINARY_FOLDER`     | No          | Letras, números, `-`, `_` y `/`                              | `zona-lab/media`        | Carpeta destino de las imágenes.        |

## Notificaciones por email

- Se configuran desde **Panel → Configuración → Notificaciones por email**.
- Campos: correo de destino, servidor SMTP, puerto, usuario y contraseña de aplicación.
- La contraseña se guarda cifrada con AES-256-GCM usando `SESSION_SECRET` como clave.
- Nunca se devuelve por la API: el panel solo informa `hasSmtpAppPassword`.
- Si se rota `SESSION_SECRET`, la contraseña guardada deja de poder descifrarse y debe cargarse de nuevo desde el panel.
- No se agregan variables de entorno nuevas para SMTP.

## Admin

Generar hash:

```bash
npm run admin:hash -- "contraseña de al menos 12 caracteres"
```

Generar secreto:

```bash
openssl rand -base64 48
```

- En desarrollo, dejar las tres variables vacías deshabilita el panel.
- Configurar solo una o dos variables es un error de arranque.
- En producción, las tres son obligatorias.

## CORS

- Usar orígenes exactos con esquema y host.
- No usar `*`.
- Incluir el dominio real del frontend.
- Si hay varios dominios, separarlos por coma.

## Cookies y proxy

- `COOKIE_SAME_SITE=lax`: frontend y backend en el mismo sitio.
- `COOKIE_SAME_SITE=none`: sitios distintos; requiere HTTPS.
- `TRUST_PROXY=true`: plataforma o proxy que termina HTTPS.
- Sin `TRUST_PROXY`, los rate limits pueden ver la IP del proxy.

## Redis

- `REDIS_URL` es opcional. Se usa para compartir los rate limits entre varias instancias del backend.
- Sin `REDIS_URL`, los límites se guardan en memoria del proceso y no se comparten.
- Acepta `redis://` y `rediss://` (TLS). Ejemplo: `rediss://default:password@host:6379`.
- Si Redis no responde, el backend sigue funcionando con el contador local en memoria.
- No se usa Redis para sesiones: la sesión admin es stateless y firmada con HMAC.

## Cloudinary

- Las tres credenciales (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`) se configuran juntas o no se configura ninguna.
- Con Cloudinary activo, las imágenes se suben también a la nube y `/uploads/media/...` redirige a `res.cloudinary.com` con `q_auto,f_auto` y ancho responsive.
- La copia local en `storage/media` se conserva como respaldo; si Cloudinary falla, se sirve la copia local.
- Migrar imágenes existentes:

```bash
npm run cloudinary:check
npm run cloudinary:sync
npm run media:migrate-cloudinary
npm run media:migrate-cloudinary -- --apply
```

- `cloudinary:sync` reconstruye `storage/cloudinary-media.json` desde las imágenes existentes en Cloudinary. Es útil en un servidor nuevo, donde no está la copia local del manifiesto.
- Al arrancar, si el manifiesto no existe, el backend intenta reconstruirlo automáticamente.

- El comando es idempotente. `--force` vuelve a subir las que ya existen.
- `storage/logos` (archivos privados de pedidos) **no** se sube a Cloudinary.

## Archivos

- `storage/media`: imágenes públicas.
- `storage/logos`: archivos privados.
- Montar volumen persistente en producción.
- Respaldar junto con MongoDB.

## Producción

1. Definir secretos en el proveedor.
2. `NODE_ENV=production`.
3. `CORS_ORIGINS` con el dominio del frontend.
4. `COOKIE_SAME_SITE` según topología.
5. `TRUST_PROXY` según plataforma.
6. HTTPS.
7. Volumen persistente y backups.
8. Verificar `/api/health/ready`.
9. Rotar secretos expuestos.
