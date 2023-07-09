require("dotenv").config();
var express = require("express");
const router = express.Router();
const Test = require("../models/Test.js");
const Logger = require("../logger.js");
const User = require("../models/User.js");
const nodemailer = require("nodemailer");

router.get("/participants/:sessionName", (req, res) => {
  const adminSecret = req.headers.authorization;

  if (adminSecret === process.env.ADMIN_SECRET) {
    try {
      User.find(
        {
          environment: process.env.NODE_ENV,
          subject: req.params.sessionName,
        },
        { code: 1, firstName: 1, mail: 1, room: 1, socketId: 1, _id: 0 }
      )
        .then((users) => {
          if (users.length > 0) {
            let orderedUsers = [];
            users.forEach((user) => {
              let isConnected = Object.keys(
                req.app._io.sockets.sockets
              ).includes(user.socketId);
              orderedUsers.push({
                code: user.code,
                firstName: user.firstName,
                mail: user.mail,
                room: user.room != undefined ? user.room : "",
                socketId: user.socketId,
                status: isConnected,
              });
            });
            res.send(orderedUsers);
          } else {
            res.send([]);
          }
        })
        .catch((error) => {
          console.log(error);
          res.sendStatus(500);
        });
    } catch (e) {
      console.log(e);
      res.sendStatus(500);
    }
  } else {
    res.sendStatus(401);
  }
});

router.delete("/participants/:sessionName/:mail", (req, res) => {
  const adminSecret = req.headers.authorization;

  if (adminSecret === process.env.ADMIN_SECRET) {
    try {
      User.findOneAndRemove({
        environment: process.env.NODE_ENV,
        subject: req.params.sessionName,
        mail: req.params.mail,
      }).then((user) => {
        if (user) {
          res.send("Participant " + user.mail + " successfully deleted!");
        } else {
          res.status(404).send("Participant not found!");
        }
      });
    } catch (e) {
      Logger.monitorLog(e);
      res.sendStatus(500);
    }
  } else {
    res.sendStatus(401);
  }
});

router.post("/participants/:sessionName/import", (req, res) => {
  const adminSecret = req.headers.authorization;

  if (adminSecret === process.env.ADMIN_SECRET) {
    try {
      let users = req.body;
      let participants = [];
      users.forEach((user) => {
        var participant = new User();
        participant.code = Math.floor(Math.random() * 100000000);
        participant.firstName = user.name;
        participant.surname = user.surname;
        participant.mail = user.email;
        participant.subject = req.params.sessionName;
        participant.environment = process.env.NODE_ENV;
        participant.gender = user.gender;
        participant.shown_gender = user.gender;
        participant.birthDate = user.birthday;
        participant.beganStudying = user.studyStartYear;

        participants.push(participant);
      });

      User.insertMany(participants);
      res.sendStatus(200);
    } catch (e) {
      Logger.monitorLog(e);
      res.sendStatus(500);
    }
  } else {
    res.sendStatus(401);
  }
});

router.get("/participants/:sessionName/export", (req, res) => {
  const adminSecret = req.headers.authorization;

  if (adminSecret === process.env.ADMIN_SECRET) {
    try {
      User.find(
        {
          environment: process.env.NODE_ENV,
          subject: req.params.sessionName,
        },
        {
          _id: 0,
          code: 1,
          firstName: 1,
          surname: 1,
          mail: 1,
          gender: 1,
          birthDate: 1,
          beganStudying: 1,
        }
      ).then((users) => {
        Logger.monitorLog("Exporting participants");
        console.log(users);
        if (users.length > 0) {
          res.send(users);
        }
      });
    } catch (e) {
      Logger.monitorLog("Error retrieving users... "+e);
      res.sendStatus(500);
    }
  } else {
    res.sendStatus(401);
  }
});

router.post("/participants/:sessionName/:mail/send", (req, res) => {
  const adminSecret = req.headers.authorization;

  if (adminSecret === process.env.ADMIN_SECRET) {
    try {
      User.findOne({
        environment: process.env.NODE_ENV,
        subject: req.params.sessionName,
        mail: req.params.mail,
      }).then((user) => {
        if (user) {
          let transporter = nodemailer.createTransport({
            name: "mail.us.es",
            host: "mail.us.es",
            requierTLS: true,
            port: 587,
            auth: {
              user: process.env.EMAIL_USERNAME,
              pass: process.env.EMAIL_PASSWORD,
            },
          });

          transporter.verify((err, success) => {
            if (err) Logger.monitorLog("Error verifying transporter: "+err);
            else Logger.monitorLog('Your config is correct');
          });

          transporter.sendMail({
            from: '"TwinCode" < ' + process.env.EMAIL_USERNAME + " > ",
            to: user.mail, // list of receivers
            subject: "TwinCode - Your code", // Subject line
            text: "Welcome to TwinCode", // plain text body
            html: `
              <h1>Welcome to TwinCode</h1>
              <br/>
              <p>Your anonymous code to participate in the twincode session is the following: <b>${user.code}</b></p>
              <p>But you can click directly <a href="https://twincode.netlify.app/?code=${user.code}">HERE</a> for easy access when the session starts.</p><br/>
              <p>You will receive detailed instructions at the beginning of the session.</p>`, // html body
          }).then((info) => {
            Logger.monitorLog("Message sent: " + info.messageId + " to " + user.mail);
            res.sendStatus(200);

            transporter.close();
            }).catch((error) => {
              Logger.monitorLog("Error sending mail: "+error);
              res.sendStatus(500);
          });
        } else {
          res.status(404).send("Participant not found!");
        }
      });
    } catch (e) {
      Logger.monitorLog(e);
      res.sendStatus(500);
    }
  } else {
    res.sendStatus(401);
  }
});

module.exports = router;
