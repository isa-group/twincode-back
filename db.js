require("dotenv").config();

const mongoose = require("mongoose");
mongoose.set("useFindAndModify", false);
 const DB_URL = process.env.MONGO_URL; //|| 'mongodb+srv://custom:5T7iOE753oKWk1sm@flockjs-db-vngeb.mongodb.net/flockjs?retryWrites=true&w=majority' ;

const dbConnect = function () {
  const db = mongoose.connection;
  db.on("error", console.error.bind(console, "connection error: "));
  return mongoose.connect(DB_URL, {
    useUnifiedTopology: true,
    useNewUrlParser: true,
    autoIndex: true,
  });
};

module.exports = dbConnect;
