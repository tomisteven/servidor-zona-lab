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
CORS_ORIGINS=http://localhost:8080
LOG_LEVEL=info
WHATSAPP_NUMBER=5491112345678
COOKIE_SAME_SITE=lax
TRUST_PROXY=false

ADMIN_EMAIL=
ADMIN_PASSWORD_HASH=
SESSION_SECRET=
```

## Referencia

| Variable              | Obligatoria | Valores admitidos                                            | Default                 | Propósito                               |
| --------------------- | ----------- | ------------------------------------------------------------ | ----------------------- | --------------------------------------- |
| `NODE_ENV`            | No          | `development`, `test`, `production`                          | `development`           | Entorno de ejecución.                   |
| `PORT`                | No          | Entero entre 1 y 65535                                       | `5050`                  | Puerto HTTP.                            |
| `MONGODB_URI`         | Sí          | URI `mongodb://` o `mongodb+srv://`                          | —                       | Conexión a MongoDB.                     |
| `CORS_ORIGINS`        | No          | Lista separada por comas, sin comodines                      | `http://localhost:8080` | Orígenes permitidos del frontend.       |
| `LOG_LEVEL`           | No          | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` | `info`                  | Nivel de Pino.                          |
| `WHATSAPP_NUMBER`     | Sí          | 10 a 15 dígitos; admite `+`, espacios, paréntesis y guiones  | —                       | Número por defecto para pedidos.        |
| `COOKIE_SAME_SITE`    | No          | `lax`, `strict`, `none`                                      | `lax`                   | SameSite de cookies del panel.          |
| `TRUST_PROXY`         | No          | `true`, `false`                                              | `false`                 | Confía en proxy HTTPS de la plataforma. |
| `ADMIN_EMAIL`         | Condicional | Correo válido, máximo 254 caracteres                         | —                       | Usuario del panel.                      |
| `ADMIN_PASSWORD_HASH` | Condicional | Hash `scrypt$...` generado por el proyecto                   | —                       | Credencial; nunca texto plano.          |
| `SESSION_SECRET`      | Condicional | Mínimo 32 caracteres                                         | —                       | Firma HMAC de la sesión.                |

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
