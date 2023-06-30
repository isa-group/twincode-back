require("dotenv").config();
var express = require("express");
const router = express.Router();
const Test = require("../models/Test.js");
const Logger = require("../logger.js");
const User = require("../models/User.js");

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
            res.sendStatus(404);
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
        participant.knownLanguages = user.knownLanguages;
        participant.beganStudying = user.studyStartYear;
        participant.numberOfSubjects = user.subjectsNumber;

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

module.exports = router;
