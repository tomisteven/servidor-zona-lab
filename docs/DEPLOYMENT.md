# Despliegue del backend

## Requisitos

- Node.js 24.
- npm 10 o superior.
- MongoDB local o MongoDB Atlas.
- HTTPS en producción.
- Volumen persistente para `storage/`.

## Instalación

```bash
npm ci --omit=dev
```

Para desarrollo o pruebas:

```bash
npm ci
```

## Arranque

```bash
npm start
```

No hay build. Node ejecuta los módulos ES directamente.

## Variables mínimas de producción

```dotenv
NODE_ENV=production
PORT=5050
MONGODB_URI=mongodb+srv://...
REDIS_URL=rediss://default:password@host:6379
CORS_ORIGINS=https://www.example.com
LOG_LEVEL=info
WHATSAPP_NUMBER=5491112345678
COOKIE_SAME_SITE=none
TRUST_PROXY=true
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD_HASH=scrypt$...
SESSION_SECRET=<secreto-de-32-o-más-caracteres>

CLOUDINARY_CLOUD_NAME=<cloud>
CLOUDINARY_API_KEY=<api-key>
CLOUDINARY_API_SECRET=<api-secret>
CLOUDINARY_FOLDER=zona-lab/media
```

## Frontend separado

- `CORS_ORIGINS` debe incluir el origen exacto del frontend.
- Si frontend y backend están en sitios distintos, usar `COOKIE_SAME_SITE=none`.
- `none` requiere HTTPS.
- Si la plataforma termina HTTPS, usar `TRUST_PROXY=true`.
- El frontend envía cookies con `credentials: 'include'`.
- Las imágenes públicas se sirven desde `/uploads/media`.
- Si Cloudinary está configurado, esa ruta redirige a `res.cloudinary.com`; el frontend no cambia.

## MongoDB

- Usar una base dedicada.
- Restringir acceso por red y credenciales.
- Verificar índices y backups.
- No ejecutar operaciones destructivas sin autorización.
- `/api/health/ready` debe responder `200`.

## Redis

- `REDIS_URL` es opcional; usalo si habrá más de una instancia del backend.
- Acepta `redis://` o `rediss://` (TLS).
- Si Redis cae, el backend sigue funcionando con rate limit en memoria.

## Archivos

- Montar volumen persistente en `storage/`.
- No usar filesystem efímero.
- Respaldar `storage/media` y `storage/logos`.
- Coordinar backups con MongoDB.
- Con Cloudinary, `storage/media` sigue siendo respaldo local; migrar con `npm run media:migrate-cloudinary -- --apply`.
- En un servidor nuevo sin `storage/`, el manifiesto se reconstruye al arrancar; también se puede forzar con `npm run cloudinary:sync`.
- Si el volumen crece, evaluar object storage y CDN.

## Proxy y HTTPS

- Terminar TLS en la plataforma o proxy.
- Preservar `Origin`, `Set-Cookie` y `x-csrf-token`.
- Configurar `TRUST_PROXY=true` si corresponde.
- Verificar que las cookies salgan con `Secure` y `SameSite=None` cuando sea necesario.

## Rate limiting

- Revisar límites si hay múltiples instancias.
- Sin almacenamiento compartido, cada instancia mantiene su propio contador.
- Ajustar según tráfico real.

## Logs

- Usar logs JSON de Pino.
- Centralizar logs en la plataforma.
- No registrar secretos ni datos personales innecesarios.
- Configurar alertas para errores 5xx y caída de MongoDB.

## Checklist

- [ ] `npm ci --omit=dev` funciona.
- [ ] Variables de producción definidas.
- [ ] `NODE_ENV=production`.
- [ ] CORS correcto.
- [ ] Cookies correctas para la topología.
- [ ] `TRUST_PROXY` correcto.
- [ ] HTTPS activo.
- [ ] MongoDB accesible y respaldado.
- [ ] Volumen persistente montado.
- [ ] `/api/health` y `/api/health/ready` responden.
- [ ] Login admin funciona.
- [ ] Notificaciones SMTP configuradas y correo de prueba recibido.
- [ ] Uploads y descargas privadas funcionan.
- [ ] Logs sin secretos.
- [ ] Backups verificados.

## Rollback

Mantener la versión anterior desplegada. Si falla un cambio, restaurar el artefacto previo y verificar salud, login, catálogo y pedidos.
