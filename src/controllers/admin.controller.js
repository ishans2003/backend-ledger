const userModel = require("../models/user.model")
const accountModel = require("../models/account.model")
const transactionModel = require("../models/transaction.model")

function paging(req) {
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25))
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
    return { limit, skip: (page - 1) * limit, page }
}

async function overview(req, res) {
    const [users, accounts, completedTransfers, totalBalance] = await Promise.all([
        userModel.countDocuments(), accountModel.countDocuments(), transactionModel.countDocuments({ status: "COMPLETED" }),
        accountModel.aggregate([{ $group: { _id: null, value: { $sum: "$balance" } } }])
    ])
    return res.json({ users, accounts, completedTransactions: completedTransfers, totalBalance: totalBalance[0]?.value || 0 })
}

async function listUsers(req, res) {
    const { limit, skip, page } = paging(req)
    const escapedSearch = String(req.query.search || "").slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const filter = escapedSearch ? { $or: [{ email: { $regex: escapedSearch, $options: "i" } }, { name: { $regex: escapedSearch, $options: "i" } }] } : {}
    const [records, total] = await Promise.all([userModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).select("name email role status emailVerified createdAt"), userModel.countDocuments(filter)])
    const allowlist = (process.env.ADMIN_EMAILS || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean)
    const users = records.map((user) => ({ ...user.toObject(), role: allowlist.includes(user.email) ? "ADMIN" : user.role }))
    return res.json({ users, page, limit, total })
}

async function updateUserStatus(req, res) {
    const { status } = req.body
    if (!["ACTIVE", "SUSPENDED"].includes(status)) return res.status(400).json({ message: "Customer status must be ACTIVE or SUSPENDED" })
    const allowlist = (process.env.ADMIN_EMAILS || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean)
    const user = await userModel.findOneAndUpdate({ _id: req.params.userId, role: { $ne: "ADMIN" }, email: { $nin: allowlist } }, { status }, { new: true, runValidators: true }).select("name email status")
    if (!user) return res.status(404).json({ message: "Customer not found or protected administrator account" })
    return res.json({ user })
}

async function listAccounts(req, res) {
    const { limit, skip, page } = paging(req)
    const [accounts, total] = await Promise.all([accountModel.find().populate("user", "name email").sort({ createdAt: -1 }).skip(skip).limit(limit), accountModel.countDocuments()])
    return res.json({ accounts, page, limit, total })
}

async function listTransactions(req, res) {
    const { limit, skip, page } = paging(req)
    const filter = req.query.status ? { status: String(req.query.status).toUpperCase() } : {}
    const [transactions, total] = await Promise.all([
        transactionModel.find(filter).populate("fromAccount", "currency user").populate("toAccount", "currency user").populate("initiatedBy", "name email").sort({ createdAt: -1 }).skip(skip).limit(limit),
        transactionModel.countDocuments(filter)
    ])
    return res.json({ transactions, page, limit, total })
}

async function updateAccountStatus(req, res) {
    const { status } = req.body
    if (!["ACTIVE", "FROZEN"].includes(status)) return res.status(400).json({ message: "Account status must be ACTIVE or FROZEN" })
    const account = await accountModel.findByIdAndUpdate(req.params.accountId, { status }, { new: true, runValidators: true })
    if (!account) return res.status(404).json({ message: "Account not found" })
    return res.json({ account })
}

module.exports = { overview, listUsers, updateUserStatus, listAccounts, listTransactions, updateAccountStatus }
