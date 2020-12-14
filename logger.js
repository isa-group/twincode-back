require("dotenv").config();
const db = require("./db.js");
const Log = require("./models/Log.js");

class Logger {
  static log(category, userId, payload, exercise, test) {
    console.log(payload);
    let log = Log({
      environment: process.env.NODE_ENV,
      category: category,
      createdBy: userId,
      payload: payload,
      exercise: exercise,
      test: test,
    });
    log.save((err) => {
      if (err) {
        console.log("There has been an error logging to Mongo: " + err);
      }
    });
  }

  static dbg(msg, obj) {
    if(obj)
      console.log("DEBUG - "+msg+" <"+JSON.stringify(obj)+">");
    else
      console.log("DEBUG - "+msg);

  }

  static dbgerr(msg, err) {
    if(err)
      console.log("DEBUG - ERROR - "+msg+" <"+JSON.stringify(err)+">");
    else
      console.log("DEBUG - ERROR - "+msg);
      
  }


  static monitorLog(msg) {
    this.log("Monitor", "Server", msg);
  }
}
module.exports = Logger;
