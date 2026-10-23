const app = require("../src/app")
const connectToDB = require("../src/config/db")
const mongoose = require("mongoose")

let connectionPromise

module.exports = async function handler(req, res) {
    if (mongoose.connection.readyState !== 1) {
        connectionPromise ??= connectToDB().catch((error) => {
            connectionPromise = undefined
            throw error
        })
        await connectionPromise
    }

    return app(req, res)
}
