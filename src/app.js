const express = require("express")
const app = express()
app.disable("x-powered-by")
if (process.env.TRUST_PROXY === "true") app.set("trust proxy", 1)

const allowedOrigins = (process.env.FRONTEND_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173")
    .split(",").map((origin) => origin.trim()).filter(Boolean)
app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff")
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin")
    res.setHeader("X-Frame-Options", "DENY")
    const origin = req.get("origin")
    if (origin && allowedOrigins.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin)
        res.setHeader("Access-Control-Allow-Credentials", "true")
        res.setHeader("Vary", "Origin")
    } else if (origin) {
        const forwardedProtocol = req.get("x-forwarded-proto")?.split(",")[0]?.trim()
        const requestOrigin = `${forwardedProtocol || req.protocol}://${req.get("host")}`
        if (origin !== requestOrigin) return res.status(403).json({ message: "This origin is not allowed" })
    }
    if (req.method === "OPTIONS") {
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS")
        res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-CSRF-Token")
        return res.sendStatus(204)
    }
    return next()
})

const fundingController = require("./controllers/funding.controller")
app.post("/api/funding/webhook", express.raw({ type: "application/json", limit: "256kb" }), fundingController.handleWebhook)
app.use(express.json({ limit: "32kb" }))
app.use(require("cookie-parser")())
app.use(require("./middleware/auth.middleware").csrfMiddleware)

/**
 * - Routes required
 */
const authRouter = require("./routes/auth.routes")
const accountRouter = require("./routes/account.routes")
const transactionRoutes = require("./routes/transaction.routes")
const fundingRoutes = require("./routes/funding.routes")
const adminRoutes = require("./routes/admin.routes")

/**
 * - Use Routes
 */

app.get("/", (req, res) => {
    res.send("Ledger Service is up and running")
})

app.use("/api/auth", authRouter)
app.use("/api/accounts", accountRouter)
app.use("/api/transactions", transactionRoutes)
app.use("/api/funding", fundingRoutes)
app.use("/api/admin", adminRoutes)

app.use((error, req, res, next) => {
    console.error("Request failed:", error.message)
    if (res.headersSent) return next(error)
    if (error.name === "ValidationError" || error.name === "CastError") return res.status(400).json({ message: error.message })
    if (error.code === 11000) return res.status(409).json({ message: "A record with those details already exists" })
    return res.status(500).json({ message: "An unexpected server error occurred" })
})

module.exports = app
