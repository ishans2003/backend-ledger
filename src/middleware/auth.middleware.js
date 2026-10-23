const userModel = require("../models/user.model")
const jwt = require("jsonwebtoken")
const tokenBlackListModel = require("../models/blackList.model")
const crypto = require("node:crypto")

function requestToken(req) {
    const bearer = /^Bearer\s+([^\s]+)$/i.exec(req.get("authorization") || "")
    return req.cookies?.token || bearer?.[1]
}

function csrfMiddleware(req, res, next) {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method) || req.path === "/api/funding/webhook") return next()
    const cookieToken = req.cookies?.token
    if (!cookieToken) return next() // Bearer clients do not use ambient browser credentials.
    const cookieCsrf = req.cookies?.csrfToken
    const headerCsrf = req.get("x-csrf-token")
    const [nonce, signature] = (cookieCsrf || "").split(".")
    const expected = nonce ? crypto.createHmac("sha256", process.env.JWT_SECRET).update(nonce).digest("hex") : ""
    const signatureBytes = /^[a-f0-9]{64}$/i.test(signature || "") ? Buffer.from(signature, "hex") : Buffer.alloc(0)
    const expectedBytes = Buffer.from(expected, "hex")
    const validSignature = signatureBytes.length === expectedBytes.length && crypto.timingSafeEqual(signatureBytes, expectedBytes)
    if (!cookieCsrf || !headerCsrf || cookieCsrf.length !== headerCsrf.length || !crypto.timingSafeEqual(Buffer.from(cookieCsrf), Buffer.from(headerCsrf)) || !validSignature) {
        return res.status(403).json({ message: "Request verification failed. Refresh and try again." })
    }
    return next()
}

async function authMiddleware(req, res, next) {
    const token = requestToken(req)
    if (!token) return res.status(401).json({ message: "Unauthorized access, token is missing" })
    let decoded
    try { decoded = jwt.verify(token, process.env.JWT_SECRET) }
    catch { return res.status(401).json({ message: "Unauthorized access, token is invalid" }) }
    if (await tokenBlackListModel.exists({ token })) return res.status(401).json({ message: "Unauthorized access, token is invalid" })
    const user = await userModel.findById(decoded.userId)
    if (!user || (decoded.sessionVersion ?? 0) !== (user.sessionVersion ?? 0)) return res.status(401).json({ message: "Unauthorized access, token is invalid" })
    if (user.status === "SUSPENDED") return res.status(403).json({ message: "This account has been suspended. Contact support.", code: "ACCOUNT_SUSPENDED" })
    req.user = user
    return next()
}

async function authSystemUserMiddleware(req, res, next) {
    const token = requestToken(req)
    if (!token) return res.status(401).json({ message: "Unauthorized access, token is missing" })
    let decoded
    try { decoded = jwt.verify(token, process.env.JWT_SECRET) }
    catch { return res.status(401).json({ message: "Unauthorized access, token is invalid" }) }
    if (await tokenBlackListModel.exists({ token })) return res.status(401).json({ message: "Unauthorized access, token is invalid" })
    const user = await userModel.findById(decoded.userId).select("+systemUser")
    if (!user || (decoded.sessionVersion ?? 0) !== (user.sessionVersion ?? 0)) return res.status(401).json({ message: "Unauthorized access, token is invalid" })
    if (user.status === "SUSPENDED") return res.status(403).json({ message: "This account has been suspended", code: "ACCOUNT_SUSPENDED" })
    if (!user.systemUser) return res.status(403).json({ message: "Forbidden access, not a system user" })
    req.user = user
    return next()
}

async function adminMiddleware(req, res, next) {
    const allowedEmails = (process.env.ADMIN_EMAILS || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean)
    if (req.user?.role === "ADMIN" || allowedEmails.includes(req.user?.email?.toLowerCase())) return next()
    return res.status(403).json({ message: "Administrator access is required" })
}

module.exports = { authMiddleware, authSystemUserMiddleware, csrfMiddleware, adminMiddleware }
