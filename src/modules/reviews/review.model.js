import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Product' },
    productName: { type: String, required: true, trim: true, maxlength: 120 },
    productSlug: { type: String, required: true, trim: true, maxlength: 140 },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true, trim: true, maxlength: 1000 },
    approved: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

reviewSchema.index({ productId: 1, approved: 1, createdAt: -1 });
reviewSchema.index({ approved: 1, createdAt: -1 });

export const Review = mongoose.models.Review ?? mongoose.model('Review', reviewSchema);
