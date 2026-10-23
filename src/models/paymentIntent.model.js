const mongoose = require("mongoose")

const paymentIntentSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
    account: { type: mongoose.Schema.Types.ObjectId, ref: "account", required: true, index: true },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, enum: ["INR"], default: "INR" },
    idempotencyKey: { type: String, required: true },
    orderId: { type: String, sparse: true, unique: true },
    paymentId: { type: String, sparse: true, unique: true },
    status: { type: String, enum: ["CREATING", "PENDING", "PROCESSING", "COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED", "FAILED"], default: "CREATING", index: true },
    refundedAmount: { type: Number, min: 0, default: 0 },
    transaction: { type: mongoose.Schema.Types.ObjectId, ref: "transaction" }
}, { timestamps: true })

paymentIntentSchema.index({ user: 1, idempotencyKey: 1 }, { unique: true })
module.exports = mongoose.model("paymentIntent", paymentIntentSchema)
