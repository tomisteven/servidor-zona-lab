# Seguridad del backend

## Modelo

- Una sola cuenta administrativa configurada por entorno.
- El servidor es la fuente de verdad de precios, permisos y validaciones.
- El frontend no es una frontera de seguridad.

## Controles implementados

### Autenticación

- Contraseña admin con scrypt y salt aleatorio.
- Comparación de tiempo constante.
- Sesión firmada con HMAC-SHA256.
- TTL de 8 horas.
- Cookie de sesión HttpOnly.
- Cookie CSRF legible por el cliente.
- `SameSite` configurable.
- `Secure` en producción.

### CSRF

- Doble cookie.
- Header `x-csrf-token` obligatorio en mutaciones admin.
- Rutas de lectura no lo requieren.

### Autorización

- `requireAdmin` en todas las rutas administrativas.
- `requireCsrf` en mutaciones.
- Descargas privadas solo con sesión admin.

### CORS

- Orígenes explícitos, sin comodines.
- `credentials: true`.
- Origen no permitido responde 403.

### Validación

- Zod en `params`, `query` y `body`.
- Reglas de negocio en servicios.
- No aceptar filtros u operadores Mongo arbitrarios.
- Lista permitida de campos en actualizaciones.

### Rate limiting

- Login: 5 intentos cada 15 minutos por IP.
- Estimación: 120 cada 15 minutos.
- Pedidos: 20 por hora.
- Revisar comportamiento detrás de proxy.

### Archivos

- Multer en memoria.
- Validación por firma binaria.
- Nombres UUID.
- SVG limitado a 2 MB y filtrado.
- Media hasta 8 MB.
- Archivos de pedido hasta 10 MB.
- Archivos privados fuera del estático.

### Secretos

- `.env` fuera de Git.
- `.env.example` sin secretos.
- No imprimir valores sensibles.
- Rotar secretos expuestos.

### Errores y logs

- Errores internos sin stack trace.
- Logs con redacción de cookies, autorización y `set-cookie`.
- No registrar contraseñas, tokens ni datos personales innecesarios.
- Query params excluidos de la ruta registrada.

## Riesgos y pendientes

- Sin MFA.
- Sin roles múltiples.
- Sin revocación individual de sesiones.
- Sin recuperación de contraseña.
- Sin auditoría de acciones admin.
- SVG validado por patrones, no por sanitizador dedicado.
- Almacenamiento local requiere volumen y backup.
- Sin análisis automatizado de vulnerabilidades en CI.
- Sin alertas de seguridad ni monitoreo centralizado.

## Checklist antes de producción

- [ ] HTTPS activo.
- [ ] CORS restringido.
- [ ] Cookies correctas para la topología.
- [ ] `TRUST_PROXY` correcto.
- [ ] Admin configurado con hash y secreto fuertes.
- [ ] Rate limits revisados.
- [ ] Volumen persistente y backups.
- [ ] Logs sin secretos.
- [ ] Dependencias revisadas.
- [ ] `/api/health/ready` monitoreado.
- [ ] Plan de rotación de secretos.
- [ ] Política de privacidad y retención de datos definida.
