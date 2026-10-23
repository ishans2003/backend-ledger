const express = require("express")
const authController = require("../controllers/auth.controller")
const { rateLimit } = require("../middleware/rateLimit.middleware")

const router = express.Router()


/* POST /api/auth/register */
router.post("/register", rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: "Too many registration attempts. Try again later." }), authController.userRegisterController)


/* POST /api/auth/login */
router.post("/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: "Too many sign-in attempts. Try again later." }), authController.userLoginController)
router.get("/csrf", authController.csrfToken)
router.get("/me", require("../middleware/auth.middleware").authMiddleware, authController.getCurrentUser)
router.post("/verify-email", rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: "Too many verification attempts. Try again later." }), authController.verifyEmail)
router.post("/resend-verification", rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: "Too many email requests. Try again later." }), authController.resendVerification)
router.post("/forgot-password", rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: "Too many password reset requests. Try again later." }), authController.forgotPassword)
router.post("/reset-password", rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: "Too many password reset attempts. Try again later." }), authController.resetPassword)

/**
 * - POST /api/auth/logout
 */
router.post("/logout", rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: "Too many sign-out requests. Try again later." }), authController.userLogoutController)



module.exports = router
