import mongoose from 'mongoose';

const siteSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'main' },
    whatsappNumber: { type: String, required: true, trim: true, maxlength: 15 },
    heroTitle: { type: String, required: true, trim: true, maxlength: 120 },
    heroSubtitle: { type: String, required: true, trim: true, maxlength: 300 },
    heroImageUrl: { type: String, default: '', trim: true, maxlength: 500 },
    emailNotificationsEnabled: { type: Boolean, default: false },
    notificationEmail: { type: String, default: '', trim: true, maxlength: 254 },
    smtpHost: { type: String, default: '', trim: true, maxlength: 255 },
    smtpPort: { type: Number, default: 587, min: 1, max: 65535 },
    smtpSecure: { type: Boolean, default: false },
    smtpUser: { type: String, default: '', trim: true, maxlength: 254 },
    smtpAppPasswordEncrypted: { type: String, default: '', maxlength: 1000 },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export const SiteSettings =
  mongoose.models.SiteSettings ?? mongoose.model('SiteSettings', siteSettingsSchema);
