const crypto = require("node:crypto")
const mongoose = require("mongoose")
const paymentIntentModel = require("../models/paymentIntent.model")
const accountModel = require("../models/account.model")
const transactionModel = require("../models/transaction.model")
const ledgerModel = require("../models/ledger.model")

function gatewayReady() { return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) }
function authHeader() { return `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64")}` }
async function gatewayRequest(path, options = {}) {
    const response = await fetch(`https://api.razorpay.com/v1${path}`, { ...options, signal: options.signal || AbortSignal.timeout(15000), headers: { Authorization: authHeader(), "Content-Type": "application/json", ...(options.headers || {}) } })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error?.description || "Payment provider request failed")
    return data
}
function validSignature(value, expected) {
    if (typeof value !== "string" || !/^[a-f0-9]{64}$/i.test(value)) return false
    const actual = Buffer.from(value, "hex")
    const correct = Buffer.from(expected, "hex")
    return actual.length === correct.length && crypto.timingSafeEqual(actual, correct)
}

async function createOrder(req, res) {
    if (!gatewayReady()) return res.status(503).json({ message: "Online funding is not configured yet" })
    const { accountId, amount, idempotencyKey } = req.body
    const numericAmount = Number(amount)
    if (!accountId || !Number.isFinite(numericAmount) || numericAmount < 1 || numericAmount > 100000 || Math.abs(numericAmount * 100 - Math.round(numericAmount * 100)) > 1e-7 || typeof idempotencyKey !== "string" || idempotencyKey.length < 8 || idempotencyKey.length > 128) {
        return res.status(400).json({ message: "Choose an account, an amount from ₹1 to ₹1,00,000, and a valid request reference" })
    }
    const account = await accountModel.findOne({ _id: accountId, user: req.user._id, status: "ACTIVE", currency: "INR" })
    if (!account) return res.status(400).json({ message: "Choose an active INR account that belongs to you" })

    let intent = await paymentIntentModel.findOne({ user: req.user._id, idempotencyKey })
    if (intent) {
        if (String(intent.account) !== String(accountId) || intent.amount !== numericAmount) return res.status(409).json({ message: "This funding reference was already used for a different request" })
        if (intent.orderId && ["PENDING", "COMPLETED"].includes(intent.status)) return res.status(200).json({ orderId: intent.orderId, amount: intent.amount, currency: intent.currency, keyId: process.env.RAZORPAY_KEY_ID, alreadyCompleted: intent.status === "COMPLETED" })
        return res.status(409).json({ message: "This funding attempt cannot be retried. Start a new attempt." })
    }

    try {
        intent = await paymentIntentModel.create({ user: req.user._id, account: account._id, amount: numericAmount, idempotencyKey, status: "CREATING" })
        const order = await gatewayRequest("/orders", { method: "POST", body: JSON.stringify({ amount: Math.round(numericAmount * 100), currency: "INR", receipt: `ledger_${String(intent._id).slice(-20)}`, notes: { intentId: String(intent._id), accountId: String(account._id) } }) })
        intent.orderId = order.id
        intent.status = "PENDING"
        await intent.save()
        return res.status(201).json({ orderId: order.id, amount: numericAmount, currency: "INR", keyId: process.env.RAZORPAY_KEY_ID })
    } catch (error) {
        if (intent?._id) await paymentIntentModel.updateOne({ _id: intent._id }, { $set: { status: "FAILED" } })
        if (error.code === 11000) return res.status(409).json({ message: "A funding attempt with this reference already exists" })
        console.error("Could not create funding order:", error.message)
        return res.status(502).json({ message: "Could not start a payment. Please try again." })
    }
}

async function creditCapturedPayment(intent, paymentId) {
    const existing = await transactionModel.findOne({ providerPaymentId: paymentId })
    if (existing?.status === "COMPLETED") return existing
    const session = await mongoose.startSession()
    try {
        session.startTransaction()
        const currentIntent = await paymentIntentModel.findById(intent._id).session(session)
        if (!currentIntent) throw new Error("FUNDING_ATTEMPT_NOT_FOUND")
        if (currentIntent.status === "COMPLETED") {
            const prior = await transactionModel.findById(currentIntent.transaction).session(session)
            await session.abortTransaction()
            return prior
        }
        if (currentIntent.status !== "PENDING" && currentIntent.status !== "PROCESSING") throw new Error("FUNDING_ATTEMPT_NOT_PENDING")
        // A captured payment must still be reconciled if an administrator froze the account
        // while checkout was open. The funds remain unavailable for transfers until unfreeze.
        const accountUpdate = await accountModel.updateOne({ _id: currentIntent.account, user: currentIntent.user, status: { $in: ["ACTIVE", "FROZEN"] }, currency: "INR" }, { $inc: { balance: currentIntent.amount } }, { session })
        if (accountUpdate.modifiedCount !== 1) throw new Error("FUNDING_ACCOUNT_NOT_ACTIVE")
        const transaction = (await transactionModel.create([{
            toAccount: currentIntent.account,
            amount: currentIntent.amount,
            idempotencyKey: `razorpay:${currentIntent.orderId}`,
            providerPaymentId: paymentId,
            initiatedBy: currentIntent.user,
            kind: "FUNDING",
            status: "PENDING"
        }], { session }))[0]
        await ledgerModel.create([{ account: currentIntent.account, amount: currentIntent.amount, transaction: transaction._id, type: "CREDIT" }], { session })
        transaction.status = "COMPLETED"
        await transaction.save({ session })
        currentIntent.status = "COMPLETED"
        currentIntent.paymentId = paymentId
        currentIntent.transaction = transaction._id
        await currentIntent.save({ session })
        await session.commitTransaction()
        return transaction
    } catch (error) {
        if (session.inTransaction()) await session.abortTransaction()
        throw error
    } finally {
        await session.endSession()
    }
}

async function verifyPayment(req, res) {
    if (!gatewayReady()) return res.status(503).json({ message: "Online funding is not configured yet" })
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body
    const intent = await paymentIntentModel.findOne({ orderId, user: req.user._id })
    if (!intent) return res.status(404).json({ message: "Funding attempt not found" })
    const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(`${intent.orderId}|${paymentId}`).digest("hex")
    if (!validSignature(signature, expected)) return res.status(400).json({ message: "Payment verification failed" })
    if (intent.status === "COMPLETED") return res.status(200).json({ message: "Money has already been added", transactionId: intent.transaction })
    try {
        const payment = await gatewayRequest(`/payments/${encodeURIComponent(paymentId)}`)
        if (payment.order_id !== intent.orderId || payment.status !== "captured" || payment.amount !== Math.round(intent.amount * 100) || payment.currency !== "INR") {
            return res.status(409).json({ message: "Payment is not captured yet. We’ll update your balance once it is confirmed." })
        }
        const transaction = await creditCapturedPayment(intent, paymentId)
        return res.status(200).json({ message: "Money added successfully", transaction })
    } catch (error) {
        console.error("Funding verification failed:", error.message)
        return res.status(503).json({ message: "Payment received; balance confirmation is pending. Refresh your activity shortly." })
    }
}

async function applyProcessedRefund(refund) {
    if (!refund?.id || !refund?.payment_id || !Number.isInteger(refund.amount) || refund.amount <= 0 || refund.currency !== "INR" || refund.status !== "processed") return
    let intent = await paymentIntentModel.findOne({ paymentId: refund.payment_id })
    if (!intent || intent.status === "PENDING") {
        if (!gatewayReady()) throw new Error("PAYMENT_PROVIDER_NOT_CONFIGURED_FOR_REFUND_RECONCILIATION")
        const payment = await gatewayRequest(`/payments/${encodeURIComponent(refund.payment_id)}`)
        if (!payment.order_id || !["captured", "refunded"].includes(payment.status) || !Number.isInteger(payment.amount_refunded) || payment.amount_refunded < refund.amount || payment.amount_refunded > payment.amount || payment.currency !== "INR") return
        intent = intent || await paymentIntentModel.findOne({ orderId: payment.order_id })
        if (!intent || intent.orderId !== payment.order_id || payment.amount !== Math.round(intent.amount * 100)) return
        if (intent.status === "PENDING") {
            await creditCapturedPayment(intent, payment.id)
            intent = await paymentIntentModel.findById(intent._id)
        }
    }
    if (!intent) return
    let amount = refund.amount / 100
    if (intent.refundedAmount + amount > intent.amount + 0.000001) throw new Error("REFUND_EXCEEDS_CAPTURED_AMOUNT")

    const session = await mongoose.startSession()
    try {
        session.startTransaction()
        const existing = await transactionModel.findOne({ providerRefundId: refund.id }).session(session)
        if (existing) { await session.abortTransaction(); return existing }
        const currentIntent = await paymentIntentModel.findById(intent._id).session(session)
        if (!currentIntent || !["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(currentIntent.status)) throw new Error("REFUND_PAYMENT_NOT_CREDITED")
        if (currentIntent.refundedAmount + amount > currentIntent.amount + 0.000001) throw new Error("REFUND_EXCEEDS_CAPTURED_AMOUNT")
        const accountUpdate = await accountModel.updateOne({ _id: currentIntent.account, user: currentIntent.user, status: { $in: ["ACTIVE", "FROZEN"] }, currency: "INR" }, { $inc: { balance: -amount } }, { session })
        if (accountUpdate.modifiedCount !== 1) throw new Error("REFUND_ACCOUNT_NOT_FOUND")
        const transaction = (await transactionModel.create([{
            toAccount: currentIntent.account,
            amount,
            idempotencyKey: `razorpay-refund:${refund.id}`,
            providerRefundId: refund.id,
            initiatedBy: currentIntent.user,
            kind: "REFUND",
            status: "COMPLETED"
        }], { session }))[0]
        await ledgerModel.create([{ account: currentIntent.account, amount, transaction: transaction._id, type: "DEBIT" }], { session })
        currentIntent.refundedAmount += amount
        currentIntent.status = currentIntent.refundedAmount >= currentIntent.amount - 0.000001 ? "REFUNDED" : "PARTIALLY_REFUNDED"
        await currentIntent.save({ session })
        await session.commitTransaction()
        return transaction
    } catch (error) {
        if (session.inTransaction()) await session.abortTransaction()
        throw error
    } finally { await session.endSession() }
}

async function handleWebhook(req, res) {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET
    if (!secret) return res.sendStatus(503)
    const signature = req.get("x-razorpay-signature") || ""
    const expected = crypto.createHmac("sha256", secret).update(req.body).digest("hex")
    if (!validSignature(signature, expected)) return res.sendStatus(400)
    let event
    try { event = JSON.parse(req.body.toString("utf8")) } catch { return res.sendStatus(400) }
    if (event.event === "refund.processed") {
        try {
            await applyProcessedRefund(event.payload?.refund?.entity)
            return res.sendStatus(200)
        } catch (error) {
            console.error("Refund webhook processing failed:", error.message)
            return res.sendStatus(500)
        }
    }
    if (event.event !== "payment.captured") return res.sendStatus(200)
    const payment = event.payload?.payment?.entity
    const intent = payment?.order_id ? await paymentIntentModel.findOne({ orderId: payment.order_id }) : null
    if (!intent || payment.amount !== Math.round(intent.amount * 100) || payment.currency !== "INR") return res.sendStatus(200)
    try { await creditCapturedPayment(intent, payment.id); return res.sendStatus(200) }
    catch (error) { console.error("Funding webhook processing failed:", error.message); return res.sendStatus(500) }
}

async function listMyFunding(req, res) {
    const intents = await paymentIntentModel.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50).select("amount currency status orderId createdAt transaction")
    return res.status(200).json({ funding: intents })
}

module.exports = { createOrder, verifyPayment, handleWebhook, listMyFunding }
