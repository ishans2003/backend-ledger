const transactionModel = require("../models/transaction.model")
const ledgerModel = require("../models/ledger.model")
const accountModel = require("../models/account.model")
const emailService = require("../services/email.service")
const mongoose = require("mongoose")

/**
 * - Create a new transaction
 * THE 10-STEP TRANSFER FLOW:
     * 1. Validate request
     * 2. Validate idempotency key
     * 3. Check account status
 * 4. Atomically reserve sender funds with the ledger entries in one session
     * 5. Create transaction (PENDING)
     * 6. Create DEBIT ledger entry
     * 7. Create CREDIT ledger entry
     * 8. Mark transaction COMPLETED
     * 9. Commit MongoDB session
     * 10. Send email notification
 */

async function createTransaction(req, res) {

    /**
     * 1. Validate request
     */
    const { fromAccount, toAccount, amount, idempotencyKey } = req.body
    const numericAmount = Number(amount)
    if (!fromAccount || !toAccount || typeof idempotencyKey !== "string" || idempotencyKey.length < 8 || idempotencyKey.length > 128 || !Number.isFinite(numericAmount) || numericAmount <= 0 || Math.abs(numericAmount * 100 - Math.round(numericAmount * 100)) > 1e-7) {
        return res.status(400).json({
            message: "FromAccount, toAccount and idempotencyKey are required, and amount must be a positive number"
        })
    }

    const fromUserAccount = await accountModel.findOne({
        _id: fromAccount,
        user: req.user._id
    })

    const toUserAccount = await accountModel.findOne({
        _id: toAccount,
    })

    if (!fromUserAccount || !toUserAccount) {
        return res.status(400).json({
            message: "Invalid fromAccount or toAccount"
        })
    }

    if (fromUserAccount._id.equals(toUserAccount._id)) {
        return res.status(400).json({ message: "Source and destination accounts must be different" })
    }

    if (fromUserAccount.currency !== toUserAccount.currency) {
        return res.status(400).json({ message: "Transfers require matching account currencies" })
    }

    /**
     * 2. Validate idempotency key
     */

    const isTransactionAlreadyExists = await transactionModel.findOne({ idempotencyKey })

    if (isTransactionAlreadyExists) {
        if (String(isTransactionAlreadyExists.initiatedBy) !== String(req.user._id) || String(isTransactionAlreadyExists.fromAccount) !== String(fromAccount) || String(isTransactionAlreadyExists.toAccount) !== String(toAccount) || isTransactionAlreadyExists.amount !== numericAmount) {
            return res.status(409).json({ message: "This idempotency key was already used for a different request" })
        }
        if (isTransactionAlreadyExists.status === "COMPLETED") {
            return res.status(200).json({
                message: "Transaction already processed",
                transaction: isTransactionAlreadyExists
            })

        }

        if (isTransactionAlreadyExists.status === "PENDING") {
            return res.status(200).json({
                message: "Transaction is still processing",
            })
        }

        if (isTransactionAlreadyExists.status === "FAILED") {
            return res.status(500).json({
                message: "Transaction processing failed, please retry"
            })
        }

        if (isTransactionAlreadyExists.status === "REVERSED") {
            return res.status(500).json({
                message: "Transaction was reversed, please retry"
            })
        }
    }

    /**
     * 3. Check account status
     */

    if (fromUserAccount.status !== "ACTIVE" || toUserAccount.status !== "ACTIVE") {
        return res.status(400).json({
            message: "Both fromAccount and toAccount must be ACTIVE to process transaction"
        })
    }

    let transaction;
    let session;
    try {


        /**
         * 5. Create transaction (PENDING)
         */
        session = await mongoose.startSession()
        session.startTransaction()

        const debited = await accountModel.updateOne(
            { _id: fromAccount, user: req.user._id, status: "ACTIVE", balance: { $gte: numericAmount } },
            { $inc: { balance: -numericAmount } },
            { session }
        )
        if (debited.modifiedCount !== 1) {
            const current = await accountModel.findById(fromAccount).session(session)
            throw new Error(current?.status === "ACTIVE" ? "INSUFFICIENT_BALANCE" : "ACCOUNT_NOT_ACTIVE")
        }
        const credited = await accountModel.updateOne(
            { _id: toAccount, status: "ACTIVE", currency: fromUserAccount.currency },
            { $inc: { balance: numericAmount } },
            { session }
        )
        if (credited.modifiedCount !== 1) throw new Error("DESTINATION_ACCOUNT_NOT_ACTIVE")

        transaction = (await transactionModel.create([ {
            fromAccount,
            toAccount,
            amount: numericAmount,
            idempotencyKey,
            initiatedBy: req.user._id,
            kind: "TRANSFER",
            status: "PENDING"
        } ], { session }))[ 0 ]

        await ledgerModel.create([ {
            account: fromAccount,
            amount: numericAmount,
            transaction: transaction._id,
            type: "DEBIT"
        } ], { session })

        await ledgerModel.create([ {
            account: toAccount,
            amount: numericAmount,
            transaction: transaction._id,
            type: "CREDIT"
        } ], { session })

        transaction.status = "COMPLETED"
        await transaction.save({ session })

        await session.commitTransaction()
    } catch (error) {
        console.error("Transaction processing failed:", error)
        if (session?.inTransaction()) await session.abortTransaction()

        if (error.message === "INSUFFICIENT_BALANCE") return res.status(400).json({ message: "Insufficient balance. Refresh your account balance and try again." })
        if (error.message === "ACCOUNT_NOT_ACTIVE" || error.message === "DESTINATION_ACCOUNT_NOT_ACTIVE") return res.status(400).json({ message: "Both accounts must be active to process this transfer" })
        if (error.code === 11000) {
            const existing = await transactionModel.findOne({ idempotencyKey })
            if (existing?.status === "COMPLETED" && String(existing.initiatedBy) === String(req.user._id)) {
                return res.status(200).json({ message: "Transaction already processed", transaction: existing })
            }
            return res.status(409).json({ message: "This transfer reference has already been used" })
        }

        return res.status(503).json({
            message: "Transfer could not be completed. No funds were moved. Retry using the same transfer reference.",
        })
    } finally {
        await session?.endSession()

    }
    /**
     * 10. Send email notification
     */
    void emailService.sendTransactionEmail(req.user.email, req.user.name, amount, toAccount, fromUserAccount.currency).catch((error) => console.error("Transfer notification failed:", error.message))

    return res.status(201).json({
        message: "Transaction completed successfully",
        transaction: transaction
    })

}

async function createInitialFundsTransaction(req, res) {
    const { toAccount, amount, idempotencyKey } = req.body
    const numericAmount = Number(amount)

    if (!toAccount || typeof idempotencyKey !== "string" || idempotencyKey.length < 8 || idempotencyKey.length > 128 || !Number.isFinite(numericAmount) || numericAmount <= 0 || Math.abs(numericAmount * 100 - Math.round(numericAmount * 100)) > 1e-7) {
        return res.status(400).json({
            message: "toAccount and idempotencyKey are required, and amount must be a positive number"
        })
    }

    const toUserAccount = await accountModel.findOne({
        _id: toAccount,
    })

    if (!toUserAccount || toUserAccount.status !== "ACTIVE") {
        return res.status(400).json({
            message: "Invalid or inactive toAccount"
        })
    }

    const fromUserAccount = await accountModel.findOne({
        user: req.user._id
    })

    if (!fromUserAccount || fromUserAccount.status !== "ACTIVE") {
        return res.status(400).json({
            message: "System user has no active funding account"
        })
    }
    if (fromUserAccount._id.equals(toUserAccount._id) || fromUserAccount.currency !== toUserAccount.currency) return res.status(400).json({ message: "Choose a different account with matching currency" })


    const existing = await transactionModel.findOne({ idempotencyKey })
    if (existing) {
        if (String(existing.initiatedBy) !== String(req.user._id) || String(existing.toAccount) !== String(toAccount) || existing.amount !== numericAmount) return res.status(409).json({ message: "This funding reference was already used for a different request" })
        return res.status(200).json({ message: "Initial funding was already processed", transaction: existing })
    }
    const session = await mongoose.startSession()
    try {
        session.startTransaction()
        const debited = await accountModel.updateOne({ _id: fromUserAccount._id, status: "ACTIVE", balance: { $gte: numericAmount } }, { $inc: { balance: -numericAmount } }, { session })
        if (debited.modifiedCount !== 1) throw new Error("INSUFFICIENT_BALANCE")
        const credited = await accountModel.updateOne({ _id: toAccount, status: "ACTIVE" }, { $inc: { balance: numericAmount } }, { session })
        if (credited.modifiedCount !== 1) throw new Error("DESTINATION_ACCOUNT_NOT_ACTIVE")
        const transaction = (await transactionModel.create([{
            fromAccount: fromUserAccount._id, toAccount, amount: numericAmount, idempotencyKey,
            initiatedBy: req.user._id, kind: "TRANSFER", status: "PENDING"
        }], { session }))[0]
        await ledgerModel.create([
            { account: fromUserAccount._id, amount: numericAmount, transaction: transaction._id, type: "DEBIT" },
            { account: toAccount, amount: numericAmount, transaction: transaction._id, type: "CREDIT" }
        ], { session })
        transaction.status = "COMPLETED"
        await transaction.save({ session })
        await session.commitTransaction()
        return res.status(201).json({ message: "Initial funds transaction completed successfully", transaction })
    } catch (error) {
        if (session.inTransaction()) await session.abortTransaction()
        if (error.message === "INSUFFICIENT_BALANCE") return res.status(400).json({ message: "System funding account has insufficient balance" })
        if (error.code === 11000) return res.status(409).json({ message: "This funding reference has already been used" })
        throw error
    } finally {
        await session.endSession()
    }


}

async function listUserTransactions(req, res) {
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25))
    const query = {}
    const accounts = await accountModel.find({ user: req.user._id }).select("_id").lean()
    const accountIds = accounts.map((account) => account._id)
    query.$or = [{ fromAccount: { $in: accountIds } }, { toAccount: { $in: accountIds } }]
    if (req.query.before) {
        const [beforeText, beforeId] = String(req.query.before).split("|")
        const before = new Date(beforeText)
        if (!Number.isNaN(before.getTime())) {
            query.$and = [{ $or: [{ createdAt: { $lt: before } }, ...(mongoose.isValidObjectId(beforeId) ? [{ createdAt: before, _id: { $lt: new mongoose.Types.ObjectId(beforeId) } }] : [])] }]
        }
    }
    const transactions = await transactionModel.find(query).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).populate("fromAccount", "currency").populate("toAccount", "currency").lean()
    const hasMore = transactions.length > limit
    if (hasMore) transactions.pop()
    const last = transactions.at(-1)
    return res.status(200).json({ transactions, hasMore, nextCursor: hasMore && last ? `${last.createdAt.toISOString()}|${last._id}` : null })
}

module.exports = {
    createTransaction,
    createInitialFundsTransaction,
    listUserTransactions
}
