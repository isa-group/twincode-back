require("dotenv").config();
var express = require("express");
var bodyParser = require("body-parser");
var cookieParser = require("cookie-parser");
var cors = require("cors");
const Logger = require("./logger.js");
const Session = require("./models/Session.js");
const User = require("./models/User.js");
const io = require("socket.io");

var app = express();

app._io = null;
app._consumer = null;

app.use(cors());
app.options("*", cors());

app.use(bodyParser.json());
app.use(cookieParser());

const fileDirectory = __dirname + "/assets/";

const auth = require("./routes/auth");
const tests = require("./routes/tests.js");
const admin = require("./routes/admin");
const consumer = require("./consumer.js");
const participants = require("./routes/participants");

app.use(auth);
app.use(tests);
app.use(admin);
app.use(participants);

app.get("/", (req, res) => {
  res.redirect(process.env.FRONTEND_URL);
});

app.post("/registerUser", async (req, res) => {
  Logger.dbg("/registerUser",req.body.code);

  try {
    const user = await User.findOne({
      code: req.body.code,
      environment: process.env.NODE_ENV,
    });
    
    Logger.dbg("/registerUser - User retrieved",user);
    
    const session = await Session.findOne({
      name: user.subject,
      environment: process.env.NODE_ENV,
    });
    
    Logger.dbg("/registerUser - Session retrieved",session);

    if (session && session.tokens.indexOf(req.body.tokenId) > -1) {
      user.token = req.body.tokenId;
      await user.save();
      Logger.dbg("/registerUser - 200",req.body.code);
      res.sendStatus(200);
    } else {
      Logger.dbgerr("/registerUser - 404"+ req.body.code);
      res.sendStatus(404);
    }
  } catch (err) {
    console.log(err);
    Logger.dbgerr("/registerUser - 500"+ req.body.code,err);
    res.sendStatus(500);
  }
});

app.get("/joinSession", async (req, res) => {
  Logger.dbg("/joinSession",req.query);
  User.findOne({
    code: req.query.code,
    environment: process.env.NODE_ENV,
  })
    .then((user) => {
      if (user) {
        Session.findOne({
          name: user.subject,
          environment: process.env.NODE_ENV,
        })
          .then((session) => {
            if (session) {
              if (session.active) {
                res.send({ code: req.query.code });
                Logger.dbg("/joinSession - Active - "+ req.query.code);
              } else {
                Logger.dbg("/joinSession - Not active - "+ req.query.code);
                res.send(
                  "Session is not active yet. If you think it is an error, contact with your coordinator."
                );
              }
            } else {
              Logger.dbgerr("/joinSession - 401a - "+ req.query.code);
              res.sendStatus(401);
            }
          })
          .catch((err) => {
            Logger.dbgerr("/joinSession - 500a - "+ req.query.code,err);
            res.sendStatus(500);
          });
      } else {
        Logger.dbgerr("/joinSession - 401b - "+ req.query.code);
        res.sendStatus(401);
      }
    })
    .catch((err) => {
      Logger.dbgerr("/joinSession - 500b - "+ req.query.code,err);
      res.sendStatus(500);
    });
});

app.get("//:mode/:rid/", (req, res) => {
  Logger.dbg("/rooms",req.params);
  res.sendFile(
    "main.html",
    {
      root: fileDirectory,
    },
    (err) => {
      Logger.dbgerr("/rooms "+ req.params,err);
      res.end();
      if (err) throw err;
    }
  );
});

app.get("/finishMessage", async (req, res) => {
  Logger.dbg("/finishMessage",req.query);
  try {
    const user = await User.findOne({
      code: req.query.code,
      environment: process.env.NODE_ENV,
    });
    const session = await Session.findOne({
      name: user.subject,
      environment: process.env.NODE_ENV,
    });
    if (session) {
      res.send({ finishMessage: session.finishMessage });
    } else {
      Logger.dbgerr("/finishMessage - 404 - "+ req.query.code);
      res.sendStatus(404);
    }
  } catch (err) {
    Logger.dbgerr("/finishMessage - 500 - "+ req.query.code,err);
    res.sendStatus(500);
  }
});

app.get("/connectedUsers", (req, res) => {
  Logger.dbg("/connectedUsers");
  res.send(Object.keys(app._io.sockets.sockets));
});

app.get("/s.io/info", async (req, res) => {
  try {
    Logger.dbg("/s.io/info");
    io = app._io;
    consumer = app._consumer;

    if (io && consumer) {
      var clients = io.sockets.clients();

      var clientsJSON = JSON.stringify(clients, null, 2);

      res.send("<html><body><pre>" + clientsJSON + "</pre></body></html>");
    } else {
      res.status(404).send("io: " + io + ", consumer: " + consumer);
    }
  } catch (err) {
    res.status(500).send(err);
  }
});

app.get("/s.io/start", async (req, res) => {
  try {
    Logger.dbg("/s.io/start");
    io = app._io;
    consumer = app._consumer;

    if (io && consumer) {
      session = {
        name: "test",
        tokenPairing: false,
      };

      await consumer.pconf(session, io);

      res.send("<html><body><pre>" + clientsJSON + "</pre></body></html>");
    } else {
      res.status(404).send("io: " + io + ", consumer: " + consumer);
    }
  } catch (err) {
    res.status(500).send(err);
  }
});

module.exports = app;
