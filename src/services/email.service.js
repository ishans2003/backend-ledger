const nodemailer = require('nodemailer')

let transporter
function getTransporter() {
    if (transporter) return transporter
    if (!process.env.EMAIL_USER || !process.env.CLIENT_ID || !process.env.CLIENT_SECRET || !process.env.REFRESH_TOKEN) {
        if (process.env.NODE_ENV === "production") throw new Error("Email delivery is not configured")
        return null
    }
    transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { type: 'OAuth2', user: process.env.EMAIL_USER, clientId: process.env.CLIENT_ID, clientSecret: process.env.CLIENT_SECRET, refreshToken: process.env.REFRESH_TOKEN },
    })
    return transporter
}

function safe(value) { return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]) }
function frontendLink(path, token) { return `${(process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "")}${path}?token=${encodeURIComponent(token)}` }

async function sendEmail(to, subject, text, html) {
    const activeTransporter = getTransporter()
    if (!activeTransporter) {
        console.info(`[development email] ${subject} to ${to}\n${text}`)
        return
    }
    await activeTransporter.sendMail({ from: `"Ledger" <${process.env.EMAIL_USER}>`, to, subject, text, html })
}

async function sendVerificationEmail(userEmail, name, token) {
    const url = frontendLink('/verify-email', token)
    const displayName = safe(name)
    await sendEmail(userEmail, 'Verify your Ledger email', `Hello ${name},\n\nVerify your email: ${url}\nThis link expires in 24 hours.`, `<p>Hello ${displayName},</p><p><a href="${safe(url)}">Verify your email</a></p><p>This link expires in 24 hours.</p>`)
}

async function sendPasswordResetEmail(userEmail, name, token) {
    const url = frontendLink('/reset-password', token)
    const displayName = safe(name)
    await sendEmail(userEmail, 'Reset your Ledger password', `Hello ${name},\n\nReset your password: ${url}\nThis link expires in 1 hour. If you did not request this, ignore this email.`, `<p>Hello ${displayName},</p><p><a href="${safe(url)}">Reset your password</a></p><p>This link expires in 1 hour. If you did not request this, ignore this email.</p>`)
}

async function sendTransactionEmail(userEmail, name, amount, toAccount, currency = "INR") {
    await sendEmail(userEmail, 'Ledger transfer completed', `Hello ${name},\n\nYour transfer of ${currency} ${amount} to account ${toAccount} was completed.`, `<p>Hello ${safe(name)},</p><p>Your transfer of ${safe(currency)} ${safe(amount)} to account ${safe(toAccount)} was completed.</p>`)
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail, sendTransactionEmail }
