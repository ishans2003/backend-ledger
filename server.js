require("dotenv").config()

if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET must be configured")
if (process.env.NODE_ENV === "production" && process.env.JWT_SECRET.length < 32) throw new Error("Production JWT_SECRET must be at least 32 characters")

const app = require("./src/app")
const connectToDB = require("./src/config/db")


const PORT = process.env.PORT || 3000

connectToDB()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Server running on ${PORT}`)
        })
    })
    .catch((error) => {
        console.error("Unable to start server:", error.message)
        process.exit(1)
    })
