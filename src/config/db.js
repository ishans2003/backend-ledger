const mongoose = require("mongoose")
const dns = require("node:dns")

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

    return mongoose.connect(process.env.MONGO_URI).then(() => {
        console.log("Server is connected to the database")
    })
}


module.exports = connectToDB
