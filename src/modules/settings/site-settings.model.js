import mongoose from 'mongoose';

const siteSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'main' },
    whatsappNumber: { type: String, required: true, trim: true, maxlength: 15 },
    heroTitle: { type: String, required: true, trim: true, maxlength: 120 },
    heroSubtitle: { type: String, required: true, trim: true, maxlength: 300 },
    heroImageUrl: { type: String, default: '', trim: true, maxlength: 500 },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export const SiteSettings =
  mongoose.models.SiteSettings ?? mongoose.model('SiteSettings', siteSettingsSchema);
