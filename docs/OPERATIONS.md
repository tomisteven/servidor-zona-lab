# Operación, backups y monitoreo

## Backup lógico

```bash
npm run backup
```

Genera `backups/<timestamp>/` con:

- `mongodb/<colección>.json`
- `manifest.json`
- `storage/media` y `storage/logos`

Es un backup lógico válido para respaldo rápido y auditoría. Para producción se recomienda además:

- snapshots de MongoDB Atlas o `mongodump`;
- volumen persistente con snapshots del proveedor;
- copia externa cifrada y fuera del servidor;
- prueba periódica de restore.

`backups/` está fuera de Git.

## Restore

No ejecutar restores sobre producción sin autorización. Para una restauración controlada:

1. Restaurar MongoDB con `mongorestore` o el snapshot del proveedor.
2. Restaurar `storage/` desde el mismo punto temporal.
3. Verificar `/api/health/ready`.
4. Verificar login, catálogo, pedidos y descargas privadas.
5. Revisar logs y consistencia de archivos.

Los JSON del backup lógico no reemplazan un `mongodump` para restauración exacta de tipos BSON.

## Optimización de imágenes

```bash
npm run media:optimize
npm run media:optimize -- --apply
npm run media:optimize -- --dir=seeds/assets-bolsos --apply
```

Redimensiona hasta 2400 px, corrige orientación y recomprime PNG/JPG/WEBP conservando el nombre y la URL. Las nuevas cargas de media ya se optimizan al subirse.

## Migración a Cloudinary

```bash
npm run media:migrate-cloudinary
npm run media:migrate-cloudinary -- --apply
```

Sube a Cloudinary las imágenes de `storage/media` que todavía no estén en el manifiesto `storage/cloudinary-media.json`. Es idempotente: las ya migradas se omiten. `--force` permite reemplazarlas.

- No elimina las copias locales: quedan como respaldo y para servir si Cloudinary falla.
- No toca `storage/logos` (archivos privados de pedidos).
- El servidor redirige `/uploads/media/...` a Cloudinary en cuanto existe la entrada en el manifiesto.
- El manifiesto se incluye en `npm run backup` porque vive dentro de `storage/`.
- En un servidor nuevo, ejecutar `npm run cloudinary:sync` o dejar que el arranque lo reconstruya automáticamente.

## Monitoreo mínimo

- Uptime externo sobre `/api/health` y `/api/health/ready`.
- Alertas para errores 5xx y caída de MongoDB.
- Revisión periódica de logs Pino.
- Alertas de espacio en disco para `storage/` y `backups/`.
- Sentry u otro APM opcional; no hay DSN configurado por defecto.

## Checklist periódico

- [ ] Backup generado y copiado fuera del servidor.
- [ ] Restore probado en staging.
- [ ] Espacio de disco revisado.
- [ ] Dependencias auditadas.
- [ ] Logs sin secretos.
- [ ] Certificados y dominios vigentes.
- [ ] Sitemap y Search Console revisados.
