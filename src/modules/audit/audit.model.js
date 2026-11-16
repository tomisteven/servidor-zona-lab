import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true, trim: true, maxlength: 200 },
    method: { type: String, required: true, maxlength: 10 },
    path: { type: String, required: true, trim: true, maxlength: 300 },
    actor: { type: String, default: '', trim: true, maxlength: 254 },
    statusCode: { type: Number, required: true, min: 100, max: 599 },
    requestId: { type: String, default: '', maxlength: 100 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });

export const AuditLog = mongoose.models.AuditLog ?? mongoose.model('AuditLog', auditLogSchema);
