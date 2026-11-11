# Convenciones de API

Adaptar estas convenciones a los contratos ya existentes antes de aplicarlas. Los contratos implementados actualmente están en [API.md](API.md).

## Principios

- Recursos y métodos HTTP coherentes.
- Validación de `params`, `query` y `body` en el límite.
- Respuestas serializadas explícitamente.
- Paginación con límite máximo y orden estable para colecciones.
- No aceptar filtros/sort keys Mongo arbitrarios.
- Autenticación y autorización en cada endpoint protegido.
- Versionar o documentar transición cuando un cambio rompe clientes.

## Ejemplo de error

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Revisá los datos enviados.",
    "details": []
  }
}
```

## Códigos HTTP orientativos

- `200`: operación correcta con respuesta.
- `201`: recurso creado.
- `204`: operación correcta sin cuerpo.
- `400` o `422`: entrada inválida, según convención consistente.
- `401`: falta autenticación válida.
- `403`: identidad autenticada sin permiso.
- `404`: recurso no encontrado o no visible según política.
- `409`: conflicto de estado o unicidad.
- `429`: límite de solicitudes excedido.
- `500`: error inesperado, con respuesta segura.

No incluir stack traces, mensajes internos de MongoDB ni datos sensibles en respuestas de producción.
