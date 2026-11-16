# Imágenes de seed

Estas imágenes se usan solo con:

```bash
npm run seed:products
```

El script copia los archivos a `storage/media` y crea o actualiza los 10 productos de demostración. No se sirven directamente desde esta carpeta.

Para usar otro directorio:

```bash
npm run seed:products -- --source=/ruta/a/imagenes
```
