import { randomBytes } from 'node:crypto';
import { constants as fileConstants } from 'node:fs';
import { access } from 'node:fs/promises';
import path from 'node:path';

import { isValidObjectId } from 'mongoose';

import { AppError } from '../../shared/errors/app-error.js';
import { getActiveProductForQuote } from '../catalog/catalog.service.js';
import { resolveWhatsappNumber } from '../settings/site-settings.service.js';
import {
  QUOTE_MIME_TYPES,
  removeStoredFile,
  resolveStoredFilePath,
  saveUploadedFile,
} from '../uploads/file-validation.js';
import { calculateQuotePricing, resolveSelections } from './pricing.js';
import { QuoteRequest } from './quote-request.model.js';
import { buildWhatsAppMessage, buildWhatsAppUrl } from './whatsapp.js';

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createQuoteCode() {
  const datePart = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const randomPart = randomBytes(5).toString('hex').toUpperCase();

  return `ZL-${datePart}-${randomPart}`;
}

function assertValidQuoteId(id) {
  if (!isValidObjectId(id)) {
    throw new AppError({
      message: 'Pedido no encontrado.',
      statusCode: 404,
      code: 'QUOTE_NOT_FOUND',
    });
  }
}

function toFileRecord(file) {
  if (!file) {
    return null;
  }

  return {
    storageKey: file.storageKey,
    originalName: file.originalName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
  };
}

function toFileDto(file, quoteId, kind) {
  if (!file) {
    return null;
  }

  return {
    originalName: file.originalName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    downloadUrl: `/api/admin/quotes/${quoteId}/files/${kind}`,
  };
}

function toPricingDto(pricing) {
  return {
    status: pricing.status,
    tier: pricing.tier
      ? {
          minQuantity: pricing.tier.minQuantity,
          maxQuantity: pricing.tier.maxQuantity,
        }
      : null,
    unitBasePrice: pricing.unitBasePrice,
    optionsUnitTotal: pricing.optionsUnitTotal,
    unitPrice: pricing.unitPrice,
    personalizationFee: pricing.personalizationFee,
    estimatedTotal: pricing.estimatedTotal,
    currency: pricing.currency ?? 'ARS',
    computedAt: pricing.computedAt,
  };
}

function toAdminQuote(quote) {
  return {
    id: quote._id.toString(),
    code: quote.code,
    createdAt: quote.createdAt,
    product: {
      id: quote.product.productId.toString(),
      name: quote.product.name,
      slug: quote.product.slug,
      category: quote.product.category,
    },
    quantity: quote.quantity,
    selections: quote.selections.map((selection) => ({
      groupId: selection.groupId,
      groupName: selection.groupName,
      choiceId: selection.choiceId,
      choiceLabel: selection.choiceLabel,
      additionalUnitPrice: selection.additionalUnitPrice,
    })),
    designNotes: quote.designNotes,
    customer: {
      name: quote.customer.name,
      brandName: quote.customer.brandName,
      phone: quote.customer.phone,
      email: quote.customer.email,
      observations: quote.customer.observations,
    },
    pricing: toPricingDto(quote.pricing),
    files: {
      logo: toFileDto(quote.logo, quote._id.toString(), 'logo'),
      reference: toFileDto(quote.reference, quote._id.toString(), 'reference'),
    },
    whatsappUrl: quote.whatsappUrl,
  };
}

export function createQuoteService({ storagePaths, defaultWhatsappNumber }) {
  async function prepareQuote(input) {
    const product = await getActiveProductForQuote(input.productId);
    const selections = resolveSelections(product, input.selections);
    const pricing = calculateQuotePricing({
      product,
      quantity: input.quantity,
      resolvedSelections: selections,
    });

    return { product, selections, pricing };
  }

  async function estimate(input) {
    const { product, selections, pricing } = await prepareQuote(input);

    return {
      product: {
        id: product._id.toString(),
        name: product.name,
        slug: product.slug,
        minimumQuantity: product.minimumQuantity,
      },
      quantity: input.quantity,
      selections,
      pricing,
    };
  }

  async function create(input, { logoFile = null, referenceFile = null } = {}) {
    const { product, selections, pricing } = await prepareQuote(input);
    const whatsappNumber = await resolveWhatsappNumber({ defaultWhatsappNumber });
    const code = createQuoteCode();
    const savedFiles = [];
    let logo = null;
    let reference = null;

    try {
      if (logoFile) {
        logo = await saveUploadedFile({
          file: logoFile,
          directory: storagePaths.logos,
          allowedMimeTypes: QUOTE_MIME_TYPES,
        });
        savedFiles.push(logo);
      }

      if (referenceFile) {
        reference = await saveUploadedFile({
          file: referenceFile,
          directory: storagePaths.logos,
          allowedMimeTypes: QUOTE_MIME_TYPES,
        });
        savedFiles.push(reference);
      }

      const quoteData = {
        code,
        quantity: input.quantity,
        designNotes: input.designNotes,
        customer: input.customer,
        selections,
        pricing,
        logo: toFileRecord(logo),
        reference: toFileRecord(reference),
        whatsappNumber,
      };
      const whatsappMessage = buildWhatsAppMessage({
        quote: quoteData,
        product,
        pricing,
        customer: input.customer,
        selections,
      });
      const whatsappUrl = buildWhatsAppUrl(whatsappNumber, whatsappMessage);

      const quote = await QuoteRequest.create({
        ...quoteData,
        product: {
          productId: product._id,
          name: product.name,
          slug: product.slug,
          category: product.category,
        },
        whatsappUrl,
      });

      return {
        quote: {
          id: quote._id.toString(),
          code: quote.code,
          createdAt: quote.createdAt,
          product: {
            id: product._id.toString(),
            name: product.name,
            slug: product.slug,
          },
          quantity: quote.quantity,
          pricing,
          files: {
            logo: Boolean(logo),
            reference: Boolean(reference),
          },
        },
        whatsappUrl,
      };
    } catch (error) {
      await Promise.all(
        savedFiles.map((file) =>
          removeStoredFile(storagePaths.logos, file.storageKey).catch(() => {}),
        ),
      );
      throw error;
    }
  }

  async function list({ page, limit, search }) {
    const filter = {};

    if (search) {
      const pattern = new RegExp(escapeRegExp(search), 'i');
      filter.$or = [
        { code: pattern },
        { 'customer.name': pattern },
        { 'customer.phone': pattern },
        { 'product.name': pattern },
      ];
    }

    const [quotes, total] = await Promise.all([
      QuoteRequest.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      QuoteRequest.countDocuments(filter),
    ]);

    return {
      items: quotes.map(toAdminQuote),
      pagination: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  async function getFile(id, kind) {
    assertValidQuoteId(id);

    const quote = await QuoteRequest.findOne({ _id: id }).select('code logo reference').lean();

    if (!quote) {
      throw new AppError({
        message: 'Pedido no encontrado.',
        statusCode: 404,
        code: 'QUOTE_NOT_FOUND',
      });
    }

    const file = quote[kind];

    if (!file) {
      throw new AppError({
        message: 'El pedido no tiene ese archivo.',
        statusCode: 404,
        code: 'FILE_NOT_FOUND',
      });
    }

    const filePath = resolveStoredFilePath(storagePaths.logos, file.storageKey);

    try {
      await access(filePath, fileConstants.R_OK);
    } catch {
      throw new AppError({
        message: 'El archivo ya no está disponible.',
        statusCode: 404,
        code: 'FILE_NOT_FOUND',
      });
    }

    const safeOriginalName = path.basename(file.originalName).replace(/["\r\n]/g, '');

    return {
      filePath,
      mimeType: file.mimeType,
      downloadName: `${quote.code}-${kind}-${safeOriginalName}`,
    };
  }

  return { estimate, create, list, getFile };
}
