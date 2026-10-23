const { Router } = require("express")
const auth = require("../middleware/auth.middleware")
const controller = require("../controllers/admin.controller")
const router = Router()

router.use(auth.authMiddleware, auth.adminMiddleware)
router.get("/overview", controller.overview)
router.get("/users", controller.listUsers)
router.patch("/users/:userId/status", controller.updateUserStatus)
router.get("/accounts", controller.listAccounts)
router.get("/transactions", controller.listTransactions)
router.patch("/accounts/:accountId/status", controller.updateAccountStatus)

module.exports = router
