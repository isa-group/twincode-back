require("dotenv").config();
var express = require("express");
const router = express.Router();
const Test = require("../models/Test.js");
const Logger = require("../logger.js");
const User = require("../models/User.js");

router.get("/participants/:sessionName", (req, res) => {
  const adminSecret = req.headers.authorization;

  if (adminSecret === process.env.ADMIN_SECRET) {
    User.find(
      {
        environment: process.env.NODE_ENV,
        subject: req.params.sessionName,
      },
      { code: 1, firstName: 1, mail: 1, room: 1, socketId: 1, _id: 0 }
      , function (err, users) {
        if (err) {
          if (err.name == 'ValidationError') {
            res.status(422).send(err);
          }
          else {
            res.status(500).send(err);
          }
        }
        else {
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
            res.status(200).send(orderedUsers);
          }else{
            res.status(204).send("No users found");
          }
        }
      })
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
module.exports = router;
