require("dotenv").config();

const mongoose = require("mongoose");
mongoose.set("useFindAndModify", false);
const DB_URL = process.env.MONGO_URL;

const dbConnect = function () {
  const db = mongoose.connection;
  db.on("error", console.error.bind(console, "connection error: "));
  return mongoose.connect(DB_URL, {
    useUnifiedTopology: true,
    useNewUrlParser: true,
  });
};

module.exports = dbConnect;
