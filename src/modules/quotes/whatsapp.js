const moneyFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function formatMoney(value) {
  return moneyFormatter.format(value);
}

export function buildWhatsAppMessage({ quote, product, pricing, customer, selections }) {
  const lines = [
    'Hola Zona Lab, quiero avanzar con este pedido:',
    '',
    `Pedido: ${quote.code}`,
    `Producto: ${product.name}`,
    `Cantidad: ${quote.quantity} unidades`,
  ];

  if (selections.length > 0) {
    lines.push('', 'Personalización:');
    for (const selection of selections) {
      lines.push(`${selection.groupName}: ${selection.choiceLabel}`);
    }
  }

  lines.push('');

  if (pricing.status === 'estimated') {
    lines.push(
      `Precio estimado: ${formatMoney(pricing.estimatedTotal)}`,
      `Detalle: ${quote.quantity} × ${formatMoney(pricing.unitPrice)} + ${formatMoney(pricing.personalizationFee)} de personalización.`,
    );
  } else {
    lines.push('Precio estimado: a cotizar según cantidad y diseño.');
  }

  lines.push('', 'Datos de contacto:', `Nombre: ${customer.name}`);

  if (customer.brandName) {
    lines.push(`Marca o institución: ${customer.brandName}`);
  }

  lines.push(`Teléfono: ${customer.phone}`);

  if (customer.email) {
    lines.push(`Correo: ${customer.email}`);
  }

  if (quote.designNotes) {
    lines.push('', `Indicaciones de diseño: ${quote.designNotes}`);
  }

  if (customer.observations) {
    lines.push('', `Observaciones: ${customer.observations}`);
  }

  const files = [];

  if (quote.logo) {
    files.push('logo');
  }

  if (quote.reference) {
    files.push('referencia');
  }

  lines.push(
    '',
    files.length > 0
      ? `Adjunto en este chat: ${files.join(' y ')}.`
      : 'No adjunté archivos de diseño.',
    'El precio estimado no incluye envío y queda sujeto a confirmación.',
  );

  return lines.join('\n');
}

export function buildWhatsAppUrl(number, message) {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
