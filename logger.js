require("dotenv").config();
const db = require("./db.js");
const Log = require("./models/Log.js");

function replacer(key, value) {
  const originalObject = this[key];
  if(originalObject instanceof Map) {
    return {
      dataType: 'Map',
      value: Array.from(originalObject.entries()), 
    };
  } else {
    return value;
  }
}

class Logger {
  static log(category, userId, payload, exercise, test) {
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
      }else{
        if(category != "Code")
          this.dbg("Saving Log - "+category+" - "+userId+": ",payload);
      }
    });
  }

  static dbg(msg, obj, fields) {
    if(obj){
      if(fields && Array.isArray(fields)){
        var logObj = {};
        for (const field in obj) {
          if(fields.includes(field))
            logObj[field] = obj[field];
        }       
        console.log("DEBUG - "+msg+" <"+JSON.stringify(logObj,replacer).slice(0, -1)+",...}>"); 
      }else{
        console.log("DEBUG - "+msg+" <"+JSON.stringify(obj,replacer)+">");
      }

    } else{
      console.log("DEBUG - "+msg);
    }

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
