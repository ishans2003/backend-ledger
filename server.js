require("dotenv").config()

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
