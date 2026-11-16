import nodemailer from 'nodemailer';

import { AppError } from '../../shared/errors/app-error.js';
import { getNotificationConfig } from '../settings/site-settings.service.js';

const moneyFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function formatMoney(value) {
  return moneyFormatter.format(value);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };

    return entities[character];
  });
}

function singleLine(value) {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

const STATUS_LABELS = {
  new: 'Pedido recibido',
  contacted: 'Pedido en proceso',
  closed: 'Pedido finalizado',
};

const STATUS_MESSAGES = {
  new: 'Recibimos tu pedido y ya está registrado.',
  contacted: 'Estamos trabajando en tu pedido y nos vamos a comunicar para coordinar los detalles.',
  closed: 'Tu pedido quedó finalizado. Gracias por confiar en Zona Lab.',
};

function buildStatusEmail({ quote }) {
  const customer = quote.customer;
  const statusLabel = STATUS_LABELS[quote.status] ?? 'Actualización de pedido';
  const price =
    quote.pricing.status === 'estimated' ? formatMoney(quote.pricing.estimatedTotal) : 'A cotizar';
  const lines = [
    `Hola ${customer.name},`,
    '',
    `Tu pedido ${quote.code} cambió de estado: ${statusLabel}.`,
    '',
    `Producto: ${quote.product.name}`,
    `Cantidad: ${quote.quantity} unidades`,
    `Precio estimado: ${price}`,
    '',
    STATUS_MESSAGES[quote.status] ?? 'Tu pedido tuvo una actualización.',
    '',
    'Si tenés alguna duda, respondé este correo.',
    'Zona Lab',
  ];
  const html = `
    <div style="font-family: Arial, sans-serif; color: #111d17; line-height: 1.5;">
      <h1 style="font-size: 20px;">${escapeHtml(statusLabel)}</h1>
      <p>Hola ${escapeHtml(customer.name)},</p>
      <p>Tu pedido <strong>${escapeHtml(quote.code)}</strong> cambió de estado.</p>
      <table style="border-collapse: collapse; width: 100%; max-width: 640px;">
        <tr>
          <th style="text-align: left; padding: 6px 12px 6px 0; color: #5c6b63;">Producto</th>
          <td style="padding: 6px 0;">${escapeHtml(quote.product.name)}</td>
        </tr>
        <tr>
          <th style="text-align: left; padding: 6px 12px 6px 0; color: #5c6b63;">Cantidad</th>
          <td style="padding: 6px 0;">${escapeHtml(quote.quantity)} unidades</td>
        </tr>
        <tr>
          <th style="text-align: left; padding: 6px 12px 6px 0; color: #5c6b63;">Precio estimado</th>
          <td style="padding: 6px 0;">${escapeHtml(price)}</td>
        </tr>
      </table>
      <p>${escapeHtml(STATUS_MESSAGES[quote.status] ?? 'Tu pedido tuvo una actualización.')}</p>
      <p style="color: #5c6b63;">Si tenés alguna duda, respondé este correo.</p>
      <p style="color: #5c6b63;">Zona Lab</p>
    </div>
  `;

  return {
    to: customer.email,
    subject: `${singleLine(statusLabel)} · ${singleLine(quote.code)} · Zona Lab`,
    text: lines.join('\n'),
    html,
  };
}

function buildContactEmail({ contact }) {
  const lines = [
    'Nueva consulta desde el sitio de Zona Lab.',
    '',
    `Nombre: ${contact.name}`,
    `Correo: ${contact.email}`,
    contact.phone ? `Teléfono: ${contact.phone}` : null,
    '',
    contact.message,
  ].filter((line) => line !== null);
  const html = `
    <div style="font-family: Arial, sans-serif; color: #111d17; line-height: 1.5;">
      <h1 style="font-size: 20px;">Nueva consulta desde el sitio</h1>
      <table style="border-collapse: collapse; width: 100%; max-width: 640px;">
        <tr><th style="text-align:left;padding:6px 12px 6px 0;color:#5c6b63;">Nombre</th><td style="padding:6px 0;">${escapeHtml(contact.name)}</td></tr>
        <tr><th style="text-align:left;padding:6px 12px 6px 0;color:#5c6b63;">Correo</th><td style="padding:6px 0;">${escapeHtml(contact.email)}</td></tr>
        <tr><th style="text-align:left;padding:6px 12px 6px 0;color:#5c6b63;">Teléfono</th><td style="padding:6px 0;">${escapeHtml(contact.phone || '—')}</td></tr>
      </table>
      <p style="white-space: pre-line; margin-top: 16px;">${escapeHtml(contact.message)}</p>
    </div>
  `;

  return {
    subject: `Consulta del sitio · ${singleLine(contact.name)}`,
    text: lines.join('\n'),
    html,
    replyTo: contact.email,
  };
}

function buildQuoteEmail({ quote, input }) {
  const customer = input.customer;
  const pricing = quote.pricing;
  const price = pricing.status === 'estimated' ? formatMoney(pricing.estimatedTotal) : 'A cotizar';
  const files = [
    quote.files.logo ? 'logo' : null,
    quote.files.reference ? 'referencia' : null,
  ].filter(Boolean);
  const lines = [
    'Recibiste un nuevo pedido en Zona Lab.',
    '',
    `Pedido: ${quote.code}`,
    `Producto: ${quote.product.name}`,
    `Cantidad: ${quote.quantity} unidades`,
    `Precio estimado: ${price}`,
    '',
    'Datos del cliente:',
    `Nombre: ${customer.name}`,
  ];

  if (customer.brandName) {
    lines.push(`Marca o institución: ${customer.brandName}`);
  }

  lines.push(`Teléfono: ${customer.phone}`);

  if (customer.email) {
    lines.push(`Correo: ${customer.email}`);
  }

  if (input.designNotes) {
    lines.push('', `Indicaciones de diseño: ${input.designNotes}`);
  }

  if (customer.observations) {
    lines.push('', `Observaciones: ${customer.observations}`);
  }

  lines.push(
    '',
    files.length > 0
      ? `Archivos disponibles en el panel: ${files.join(' y ')}.`
      : 'El pedido no incluye archivos.',
    'Ingresá al panel administrativo para ver el detalle completo y descargar los archivos.',
  );

  const htmlRows = [
    ['Pedido', quote.code],
    ['Producto', quote.product.name],
    ['Cantidad', `${quote.quantity} unidades`],
    ['Precio estimado', price],
    ['Cliente', customer.name],
    ['Marca o institución', customer.brandName || '—'],
    ['Teléfono', customer.phone],
    ['Correo', customer.email || '—'],
    ['Indicaciones de diseño', input.designNotes || '—'],
    ['Observaciones', customer.observations || '—'],
    ['Archivos', files.length > 0 ? files.join(' y ') : 'Sin archivos'],
  ];
  const html = `
    <div style="font-family: Arial, sans-serif; color: #111d17; line-height: 1.5;">
      <h1 style="font-size: 20px;">Nuevo pedido en Zona Lab</h1>
      <table style="border-collapse: collapse; width: 100%; max-width: 640px;">
        ${htmlRows
          .map(
            ([label, value]) => `
          <tr>
            <th style="text-align: left; padding: 6px 12px 6px 0; vertical-align: top; color: #5c6b63;">${escapeHtml(label)}</th>
            <td style="padding: 6px 0; vertical-align: top;">${escapeHtml(value)}</td>
          </tr>`,
          )
          .join('')}
      </table>
      <p style="margin-top: 16px; color: #5c6b63;">
        Ingresá al panel administrativo para ver el detalle completo y descargar los archivos.
      </p>
    </div>
  `;

  return {
    subject: `Nuevo pedido ${singleLine(quote.code)} · ${singleLine(quote.product.name)}`,
    text: lines.join('\n'),
    html,
  };
}

export function createQuoteNotifier({
  encryptionSecret = '',
  logger,
  createTransport = nodemailer.createTransport,
  resolveConfig = getNotificationConfig,
} = {}) {
  async function send(config, message) {
    const transport = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.password,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });

    return transport.sendMail({
      from: config.user,
      to: config.to,
      ...message,
    });
  }

  async function notifyQuote({ quote, input }) {
    try {
      const config = await resolveConfig({ encryptionSecret });

      if (!config) {
        return false;
      }

      await send(config, buildQuoteEmail({ quote, input }));
      return true;
    } catch (error) {
      logger?.warn({ err: error }, 'quote_notification_failed');
      return false;
    }
  }

  async function notifyContact({ contact }) {
    try {
      const config = await resolveConfig({ encryptionSecret });

      if (!config) {
        return false;
      }

      await send(config, buildContactEmail({ contact }));
      return true;
    } catch (error) {
      logger?.warn({ err: error }, 'contact_notification_failed');
      return false;
    }
  }

  async function notifyStatusChange({ quote }) {
    try {
      if (!quote.customer?.email) {
        return false;
      }

      const config = await resolveConfig({ encryptionSecret });

      if (!config) {
        return false;
      }

      await send(config, buildStatusEmail({ quote }));
      return true;
    } catch (error) {
      logger?.warn({ err: error }, 'quote_status_notification_failed');
      return false;
    }
  }

  async function sendTest() {
    const config = await resolveConfig({ encryptionSecret });

    if (!config) {
      throw new AppError({
        message: 'Configurá y activá las notificaciones por email antes de enviar una prueba.',
        statusCode: 400,
        code: 'EMAIL_NOT_CONFIGURED',
      });
    }

    try {
      await send(config, {
        subject: 'Prueba de notificaciones · Zona Lab',
        text: 'Si recibís este correo, las notificaciones de nuevos pedidos están funcionando.',
        html: '<p>Si recibís este correo, las notificaciones de nuevos pedidos están funcionando.</p>',
      });
    } catch (error) {
      logger?.warn({ err: error }, 'quote_notification_test_failed');

      throw new AppError({
        message: 'No se pudo enviar el correo de prueba. Revisá la configuración SMTP.',
        statusCode: 502,
        code: 'EMAIL_SEND_FAILED',
      });
    }

    return true;
  }

  return { notifyQuote, notifyStatusChange, notifyContact, sendTest };
}
