# ADR-0003: Cotizador, pedidos, archivos y panel administrativo

- Estado: Aceptada
- Fecha: 2026-10-22
- Responsables: equipo de Zona Lab

## Contexto

La base técnica no incluía funcionalidades de negocio. El requerimiento agrega catálogo, personalización, precios por cantidad, carga de archivos, registro de pedidos, WhatsApp y un panel privado. El frontend no puede ser la fuente de verdad de precios ni permisos, y no se justifica separar servicios.

## Opciones consideradas

1. **Calcular precios en el navegador y enviar el total** — simple, pero manipulable y propenso a inconsistencias entre cotización y pedido.
2. **Agregar microservicios, colas o almacenamiento de objetos desde el inicio** — mayor escalabilidad teórica, pero costo operativo sin demanda medida.
3. **Extender el monolito modular** con módulos de catálogo, pedidos, settings, auth y uploads, manteniendo pricing autoritativo y archivos locales.

## Decisión

- **Pricing en servidor:** estimación y creación de pedido ejecutan la misma función pura. Sin tramo publicado, el resultado es `custom`; nunca se inventa un precio.
- **Sesión admin sin estado:** token firmado con HMAC-SHA256, cookie HttpOnly y TTL de 8 horas. CSRF con doble cookie y header `x-csrf-token`.
- **Contraseña admin:** scrypt con salt aleatorio; el hash se configura por entorno y se genera con un script del proyecto.
- **Validación:** Zod en HTTP y validación adicional de reglas de negocio en servicios.
- **Frontend:** React Router para rutas públicas y admin; sin estado global externo. El wizard mantiene estado local y delega precios al backend.
- **Archivos:** Multer en memoria, validación por firma binaria y escritura con nombre UUID. Media pública en `storage/media`; logos y referencias privadas en `storage/logos`.
- **Rate limiting:** límites en login, estimación y creación de pedidos.
- **WhatsApp:** el backend construye el mensaje y la URL; el frontend la abre. Los archivos se adjuntan manualmente.

## Consecuencias

- Positivas: un solo despliegue; precios consistentes; permisos y archivos fuera del alcance público; menor costo operativo.
- Negativas/trade-offs: una sola cuenta admin; sesiones no revocables individualmente; almacenamiento local requiere volumen persistente y backup.
- Seguridad: el frontend no decide precios ni autorización; CSRF, rate limiting y validación por firma reducen abuso. El SVG se inspecciona por patrones, no con un sanitizador dedicado.
- Datos: los pedidos guardan snapshots para no cambiar cuando el producto se edite. La baja de productos es lógica.
- Rendimiento: consultas paginadas y archivos servidos por Express. Si el volumen crece, evaluar almacenamiento de objetos y CDN.
- Operación: MongoDB y `backend/storage` deben respaldarse de forma coordinada.

## Revisión

Revisar esta decisión si:

- se requiere más de una cuenta admin, roles o revocación de sesiones;
- el volumen de archivos o tráfico exige almacenamiento de objetos/CDN;
- se automatiza el envío de archivos o la integración con la API de WhatsApp;
- aparecen requisitos de auditoría, pagos o inventario;
- una medición demuestra límites de rendimiento del monolito.
