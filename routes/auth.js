require("dotenv").config();
var express = require("express");
const router = express.Router();
const User = require("../models/User.js");
const nodemailer = require("nodemailer");
const Logger = require("../logger.js");
const Session = require("../models/Session.js");

router.post("/login", (req, res) => {
  let responseBody = {
    found: false,
    room: null,
    code: null,
  };

  console.log(req.body.code);

  User.findOne(
    { code: req.body.code, environment: process.env.NODE_ENV },
    (err, user) => {
      if (user && !err) {
        responseBody.found = true;
        responseBody.room = user.room;
        responseBody.code = user.code;
      }
      res.status(responseBody.found ? 200 : 401).send(responseBody);
    }
  );
});

router.post("/signup", async (req, res) => {
  var code = Math.floor(Math.random() * 1000000 + 1);
  var codeList = await User.find().then((result) => {
    var listAux = []
    for(r=0;r<result.length;r++) {
      listAux.push(result[r].code);
    }
    return listAux;
  });


  var repeated = false;
  while(true) {
    for(c=0;c<codeList.length;c++) {
      if (codeList[c] == code.toString()) {
        repeated = true;
        break;
      }
    }
    
    if(repeated) {
      code = Math.floor(Math.random() * 1000000 + 1);
      repeated = false;
    } else {
      break;
    }
  }
  

  const newUser = new User(req.body);
  newUser.code = code;

  const session = await Session.findOne({
    name: req.body.subject,
    environment: process.env.NODE_ENV,
  });

  if (session != null && session.active && !session.running) {
    const bodyResponse = {
      registrationText:
        session.registrationText ||
        "You will receive now an email with the next steps.",
    };

    try {
      await newUser.save();

      console.log("New user saved: "+JSON.stringify(newUser,null,2));


      let transporter = nodemailer.createTransport({
        host: "mail.us.es",
        port: 587,
        requireTLS: true,
        auth: {
          user: process.env.EMAIL_USERNAME,
          pass: process.env.EMAIL_PASSWORD,
        },
      });


      let info = await transporter.sendMail({
        from: '"TwinCode Team 👩🏼‍💻👨🏽‍💻" <no-reply@twincode.com>', // sender address
        to: newUser.mail, // list of receivers
        subject: "Welcome to TwinCode ✔", // Subject line
        text: "Welcome to TwinCode", // plain text body
        html: `
    <h1>Welcome to TwinCode</h1>
    <br/>
    <p>Your code in order to participate in the session is the following: <b>${code}</b></p>
    <p>Detailed instructions on how to participate in the experiment will be sent in a further email.</p><br/>
    <p>But you can click directly <a href="https://twincode.netlify.app/?code=${code}">here</a> for easy access when the session starts.</p>`, // html body
      });

      Logger.monitorLog("Message sent: "+ info.messageId);
      res.send(bodyResponse);
      res.sendStatus(200);
    } catch (e) {
      Logger.monitorLog(e);
      if (e.name == "ValidationError") {
        res.sendStatus(400);
      } else if (e.code == 11000) {
        res.status(400).send({
          code: "DUPLICATE",
          message: "User already registered on the session.",
        });
      } else {
        res.send({"error": e})
        res.sendStatus(500);
      }
    }
  } else {
    res.status(404).send("No active session exists");
  }
});

module.exports = router;
