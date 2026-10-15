const mongoose = require("mongoose")



function connectToDB() {
    if (!process.env.MONGO_URI) {
        return Promise.reject(new Error("MONGO_URI is not configured"))
    }

    return mongoose.connect(process.env.MONGO_URI).then(() => {
        console.log("Server is connected to the database")
    })
}


module.exports = connectToDB
