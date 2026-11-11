import mongoose from 'mongoose';

import { PRODUCT_CATEGORY_VALUES } from './catalog.constants.js';

const priceTierSchema = new mongoose.Schema(
  {
    minQuantity: { type: Number, required: true, min: 1 },
    maxQuantity: { type: Number, default: null, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const choiceSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 80 },
    additionalUnitPrice: { type: Number, default: 0, min: 0 },
  },
  { _id: true },
);

const optionGroupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    required: { type: Boolean, default: false },
    choices: {
      type: [choiceSchema],
      default: [],
      validate: {
        validator: (choices) => choices.length > 0 && choices.length <= 30,
        message: 'Cada grupo de opciones debe tener entre 1 y 30 opciones.',
      },
    },
  },
  { _id: true },
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 140 },
    category: {
      type: String,
      required: true,
      enum: PRODUCT_CATEGORY_VALUES,
    },
    shortDescription: { type: String, required: true, trim: true, maxlength: 240 },
    description: { type: String, default: '', trim: true, maxlength: 5000 },
    features: { type: [String], default: [] },
    imageUrl: { type: String, default: '', trim: true, maxlength: 500 },
    active: { type: Boolean, default: true },
    minimumQuantity: { type: Number, default: 10, min: 1 },
    personalizationFee: { type: Number, default: 0, min: 0 },
    priceTiers: {
      type: [priceTierSchema],
      default: [],
      validate: {
        validator: (tiers) => tiers.length > 0 && tiers.length <= 20,
        message: 'El producto debe tener entre 1 y 20 tramos de precio.',
      },
    },
    optionGroups: {
      type: [optionGroupSchema],
      default: [],
      validate: {
        validator: (groups) => groups.length <= 10,
        message: 'El producto admite hasta 10 grupos de opciones.',
      },
    },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

productSchema.index({ slug: 1 }, { unique: true });
productSchema.index({ deletedAt: 1, active: 1, category: 1, createdAt: -1 });
productSchema.index({ deletedAt: 1, active: 1, createdAt: -1 });
productSchema.index({ deletedAt: 1, createdAt: -1 });

export const Product = mongoose.models.Product ?? mongoose.model('Product', productSchema);
