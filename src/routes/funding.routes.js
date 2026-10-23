const { Router } = require("express")
const auth = require("../middleware/auth.middleware")
const controller = require("../controllers/funding.controller")
const { rateLimit } = require("../middleware/rateLimit.middleware")
const router = Router()

router.post("/orders", rateLimit({ windowMs: 60 * 60 * 1000, max: 20, message: "Too many payment attempts. Try again later." }), auth.authMiddleware, controller.createOrder)
router.post("/verify", rateLimit({ windowMs: 60 * 60 * 1000, max: 30, message: "Too many payment verification attempts. Try again later." }), auth.authMiddleware, controller.verifyPayment)
router.get("/", auth.authMiddleware, controller.listMyFunding)

module.exports = router
