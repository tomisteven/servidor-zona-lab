import mongoose from 'mongoose';

const fileSchema = new mongoose.Schema(
  {
    storageKey: { type: String, required: true },
    originalName: { type: String, required: true, maxlength: 180 },
    mimeType: { type: String, required: true, maxlength: 120 },
    sizeBytes: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const selectionSchema = new mongoose.Schema(
  {
    groupId: { type: String, required: true, maxlength: 64 },
    groupName: { type: String, required: true, maxlength: 80 },
    choiceId: { type: String, required: true, maxlength: 64 },
    choiceLabel: { type: String, required: true, maxlength: 80 },
    additionalUnitPrice: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const pricingSchema = new mongoose.Schema(
  {
    status: { type: String, required: true, enum: ['estimated', 'custom'] },
    tier: {
      minQuantity: { type: Number, default: null },
      maxQuantity: { type: Number, default: null },
    },
    unitBasePrice: { type: Number, default: null },
    optionsUnitTotal: { type: Number, default: 0 },
    unitPrice: { type: Number, default: null },
    personalizationFee: { type: Number, default: 0 },
    estimatedTotal: { type: Number, default: null },
    currency: { type: String, default: 'ARS' },
    computedAt: { type: Date, required: true },
  },
  { _id: false },
);

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    brandName: { type: String, default: '', trim: true, maxlength: 80 },
    phone: { type: String, required: true, trim: true, maxlength: 30 },
    email: { type: String, default: '', trim: true, maxlength: 254 },
    observations: { type: String, default: '', trim: true, maxlength: 1000 },
  },
  { _id: false },
);

const productSnapshotSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Product' },
    name: { type: String, required: true, maxlength: 120 },
    slug: { type: String, required: true, maxlength: 140 },
    category: { type: String, required: true, maxlength: 60 },
  },
  { _id: false },
);

const quoteRequestSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    product: { type: productSnapshotSchema, required: true },
    quantity: { type: Number, required: true, min: 1, max: 1000000 },
    selections: { type: [selectionSchema], default: [] },
    designNotes: { type: String, default: '', trim: true, maxlength: 2000 },
    logo: { type: fileSchema, default: null },
    reference: { type: fileSchema, default: null },
    pricing: { type: pricingSchema, required: true },
    customer: { type: customerSchema, required: true },
    whatsappNumber: { type: String, required: true, maxlength: 15 },
    whatsappUrl: { type: String, required: true, maxlength: 20000 },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

quoteRequestSchema.index({ code: 1 }, { unique: true });
quoteRequestSchema.index({ createdAt: -1 });

export const QuoteRequest =
  mongoose.models.QuoteRequest ?? mongoose.model('QuoteRequest', quoteRequestSchema);
