const mongoose = require("mongoose")
const dns = require("node:dns")
const accountModel = require("../models/account.model")
const ledgerModel = require("../models/ledger.model")
const userModel = require("../models/user.model")

async function migrateLegacyData() {
    // Preserve existing customers when the new email-verification field is introduced.
    await userModel.updateMany({ emailVerified: { $exists: false } }, { $set: { emailVerified: true } })
    const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean)
    if (adminEmails.length) await userModel.updateMany({ email: { $in: adminEmails } }, { $set: { role: "ADMIN" } })

    // Initialize the cached balance from the immutable ledger before accepting requests.
    const legacyAccounts = await accountModel.find({ balance: { $exists: false } }).select("_id").lean()
    if (legacyAccounts.length) {
        const ids = legacyAccounts.map((account) => account._id)
        const totals = await ledgerModel.aggregate([
            { $match: { account: { $in: ids } } },
            { $group: { _id: { account: "$account", type: "$type" }, amount: { $sum: "$amount" } } }
        ])
        const balances = new Map(ids.map((id) => [String(id), 0]))
        for (const item of totals) {
            const id = String(item._id.account)
            balances.set(id, (balances.get(id) || 0) + (item._id.type === "CREDIT" ? item.amount : -item.amount))
        }
        await accountModel.bulkWrite(legacyAccounts.map((account) => ({ updateOne: { filter: { _id: account._id, balance: { $exists: false } }, update: { $set: { balance: balances.get(String(account._id)) || 0 } } } })))
    }
}

// Node's SRV resolver can be refused by some local DNS servers. Use public
// resolvers by default; MONGO_DNS_SERVERS can override them (comma-separated).
const dnsServers = (process.env.MONGO_DNS_SERVERS || "1.1.1.1,8.8.8.8")
    .split(",")
    .map((server) => server.trim())
    .filter(Boolean)

if (dnsServers.length > 0) {
    dns.setServers(dnsServers)
}



function connectToDB() {
    if (!process.env.MONGO_URI) {
        return Promise.reject(new Error("MONGO_URI is not configured"))
    }

    return mongoose.connect(process.env.MONGO_URI).then(async () => {
        await migrateLegacyData()
        console.log("Server is connected to the database")
    })
}


module.exports = connectToDB
