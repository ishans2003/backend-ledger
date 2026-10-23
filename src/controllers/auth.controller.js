const crypto = require("node:crypto")
const jwt = require("jsonwebtoken")
const userModel = require("../models/user.model")
const emailService = require("../services/email.service")
const tokenBlackListModel = require("../models/blackList.model")

const COOKIE_AGE = 3 * 24 * 60 * 60 * 1000
function cookieOptions(httpOnly = true) {
    return { httpOnly, secure: process.env.NODE_ENV === "production" || process.env.SESSION_SAME_SITE === "none", sameSite: process.env.SESSION_SAME_SITE || "lax", maxAge: COOKIE_AGE, path: "/" }
}
function cookieClearOptions(httpOnly = true) {
    return { httpOnly, secure: process.env.NODE_ENV === "production" || process.env.SESSION_SAME_SITE === "none", sameSite: process.env.SESSION_SAME_SITE || "lax", path: "/" }
}
function publicUser(user) {
    const admins = (process.env.ADMIN_EMAILS || "").split(",").map((email) => email.trim().toLowerCase())
    const isAdmin = user.role === "ADMIN" || admins.includes(user.email.toLowerCase())
    return { _id: user._id, email: user.email, name: user.name, role: isAdmin ? "ADMIN" : "USER", emailVerified: Boolean(user.emailVerified) }
}
function issueSession(user, res) {
    const token = jwt.sign({ userId: user._id, sessionVersion: user.sessionVersion || 0 }, process.env.JWT_SECRET, { expiresIn: "3d" })
    res.cookie("token", token, cookieOptions(true))
}
function tokenHash(token) { return crypto.createHash("sha256").update(token).digest("hex") }
function makeToken() { return crypto.randomBytes(32).toString("hex") }
function normalizeEmail(email) { return typeof email === "string" ? email.trim().toLowerCase() : "" }

async function userRegisterController(req, res) {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : ""
    const email = normalizeEmail(req.body.email)
    const password = req.body.password
    if (!name || name.length > 100 || !email || typeof password !== "string" || password.length < 8 || password.length > 128) {
        return res.status(400).json({ message: "Enter a name, valid email, and password of at least 8 characters" })
    }
    if (await userModel.exists({ email })) return res.status(422).json({ message: "An account already exists for this email address" })
    const rawToken = makeToken()
    const user = await userModel.create({ name, email, password, emailVerified: false, emailVerificationTokenHash: tokenHash(rawToken), emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000) })
    await emailService.sendVerificationEmail(email, name, rawToken)
    return res.status(201).json({ message: "Check your email for a verification link before signing in" })
}

async function verifyEmail(req, res) {
    const token = typeof req.body.token === "string" ? req.body.token : ""
    if (!token) return res.status(400).json({ message: "Verification token is required" })
    const user = await userModel.findOne({ emailVerificationTokenHash: tokenHash(token), emailVerificationExpires: { $gt: new Date() } })
    if (!user) return res.status(400).json({ message: "This verification link is invalid or expired. Request a new one." })
    user.emailVerified = true
    user.emailVerificationTokenHash = undefined
    user.emailVerificationExpires = undefined
    await user.save()
    return res.status(200).json({ message: "Email verified. You can sign in now." })
}

async function resendVerification(req, res) {
    const email = normalizeEmail(req.body.email)
    const user = await userModel.findOne({ email })
    if (user && !user.emailVerified) {
        const rawToken = makeToken()
        user.emailVerificationTokenHash = tokenHash(rawToken)
        user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000)
        await user.save()
        await emailService.sendVerificationEmail(user.email, user.name, rawToken)
    }
    return res.status(200).json({ message: "If the account needs verification, a new link has been sent." })
}

async function userLoginController(req, res) {
    const email = normalizeEmail(req.body.email)
    const password = req.body.password
    const user = await userModel.findOne({ email }).select("+password")
    if (!user || typeof password !== "string" || !(await user.comparePassword(password))) return res.status(401).json({ message: "Email or password is invalid" })
    if (user.status === "SUSPENDED") return res.status(403).json({ message: "This account has been suspended. Contact support.", code: "ACCOUNT_SUSPENDED" })
    if (!user.emailVerified) return res.status(403).json({ message: "Verify your email before signing in", code: "EMAIL_NOT_VERIFIED" })
    issueSession(user, res)
    return res.status(200).json({ user: publicUser(user) })
}

async function forgotPassword(req, res) {
    const email = normalizeEmail(req.body.email)
    const user = await userModel.findOne({ email })
    if (user) {
        const rawToken = makeToken()
        user.passwordResetTokenHash = tokenHash(rawToken)
        user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000)
        await user.save()
        await emailService.sendPasswordResetEmail(user.email, user.name, rawToken)
    }
    return res.status(200).json({ message: "If an account exists for that email, a password reset link has been sent." })
}

async function resetPassword(req, res) {
    const token = typeof req.body.token === "string" ? req.body.token : ""
    const password = req.body.password
    if (!token || typeof password !== "string" || password.length < 8 || password.length > 128) return res.status(400).json({ message: "A valid reset token and password of at least 8 characters are required" })
    const user = await userModel.findOne({ passwordResetTokenHash: tokenHash(token), passwordResetExpires: { $gt: new Date() } }).select("+password")
    if (!user) return res.status(400).json({ message: "This reset link is invalid or expired. Request another." })
    user.password = password
    user.passwordResetTokenHash = undefined
    user.passwordResetExpires = undefined
    user.sessionVersion = (user.sessionVersion || 0) + 1
    await user.save()
    return res.status(200).json({ message: "Password reset. Sign in with your new password." })
}

async function getCurrentUser(req, res) { return res.status(200).json({ user: publicUser(req.user) }) }

async function csrfToken(req, res) {
    const nonce = crypto.randomBytes(32).toString("hex")
    const signature = crypto.createHmac("sha256", process.env.JWT_SECRET).update(nonce).digest("hex")
    const token = `${nonce}.${signature}`
    res.cookie("csrfToken", token, { ...cookieOptions(false), httpOnly: false })
    return res.status(200).json({ csrfToken: token })
}

async function userLogoutController(req, res) {
    const bearer = /^Bearer\s+([^\s]+)$/i.exec(req.get("authorization") || "")
    const token = req.cookies?.token || bearer?.[1]
    if (token) {
        let validToken = false
        try {
            jwt.verify(token, process.env.JWT_SECRET)
            validToken = true
        } catch { /* Expired or invalid tokens need only have their cookie cleared. */ }
        if (validToken) {
            try { await tokenBlackListModel.create({ token }) }
            catch (error) { if (error.code !== 11000) throw error }
        }
    }
    res.clearCookie("token", cookieClearOptions(true))
    res.clearCookie("csrfToken", cookieClearOptions(false))
    return res.status(200).json({ message: "Signed out" })
}

module.exports = { userRegisterController, userLoginController, userLogoutController, verifyEmail, resendVerification, forgotPassword, resetPassword, getCurrentUser, csrfToken }
