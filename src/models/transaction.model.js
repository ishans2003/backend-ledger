const mongoose = require("mongoose")


const transactionSchema = new mongoose.Schema({
    fromAccount: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "account",
        required: false,
        index: true
    },
    toAccount: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "account",
        required: [ true, "Transaction must be associated with a to account" ],
        index: true
    },
    status: {
        type: String,
        enum: {
            values: [ "PENDING", "COMPLETED", "FAILED", "REVERSED" ],
            message: "Status can be either PENDING, COMPLETED, FAILED or REVERSED",
        },
        default: "PENDING"
    },
    amount: {
        type: Number,
        required: [ true, "Amount is required for creating a transaction" ],
        min: [ 0, "Transaction amount cannot be negative" ]
    },
    idempotencyKey: {
        type: String,
        required: [ true, "Idempotency Key is required for creating a transaction" ],
        index: true,
        unique: true
    },
    kind: {
        type: String,
        enum: ["TRANSFER", "FUNDING", "REFUND"],
        default: "TRANSFER",
        index: true
    },
    providerPaymentId: {
        type: String,
        sparse: true,
        unique: true
    },
    providerRefundId: { type: String, sparse: true, unique: true },
    initiatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        index: true
    }
}, {
    timestamps: true
})

const transactionModel = mongoose.model("transaction", transactionSchema)


module.exports = transactionModel
