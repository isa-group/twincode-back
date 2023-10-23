require("dotenv").config();
var express = require("express");
const router = express.Router();
const Test = require("../models/Test.js");
// const Exercise = require("../models/Exercise.js")
const Logger = require("../logger.js");
const User = require("../models/User.js");
const Session = require("../models/Session.js");
const Log = require("../models/Log.js");
const consumer = require("../consumer.js");
// Import csv-writer
const csvwriter = require('csv-writer');

var createCsvWriter = csvwriter.createObjectCsvWriter
/**
 * SESSIONS
 */

router.post("/startSession/:sessionName", async (req, res) => {
  const adminSecret = req.headers.authorization;

  if (adminSecret === process.env.ADMIN_SECRET) {
    consumer.startSession(req.params.sessionName, req.app._io);
    res.send({ msg: "Session started" });
  } else {
    res.sendStatus(401);
  }
});

router.get("/sessions", async (req, res) => {
  const adminSecret = req.headers.authorization;

  const limit = 100;
  const skip = parseInt(req.query.skip) || 0;

  if (adminSecret === process.env.ADMIN_SECRET && limit <= 100) {
    const sessions = await Session.aggregate([
      {
        $lookup: {
          from: "users",
          let: { session_env: "$environment", session_name: "$name" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$environment", "$$session_env"] },
                    { $eq: ["$subject", "$$session_name"] },
                  ],
                },
              },
            },
            { $project: { firstName: -1, _id: 0 } },
          ],
          as: "users",
        },
      },
      {
        $project: {
          _id: 0,
          tokens: 0,
          testCounter: 0,
          exerciseCounter: 0,
        },
      },
    ])
    .limit(limit)
      .skip(skip);

    res.send(sessions);
  } else if (limit > 20) {
    res.status(400).send("Limit parameter cannot exceed 20!");
  } else {
    res.sendStatus(401);
  }
});

router.get("/sessions/:sessionName", (req, res) => {
  const adminSecret = req.headers.authorization;
  console.log("ENTORNO DE NODE: " + process.env.NODE_ENV);
  if (adminSecret === process.env.ADMIN_SECRET) {
    try {
      Session.findOne({
        environment: process.env.NODE_ENV,
        name: req.params.sessionName,
      })
        .then((session) => {
          if (session) {
            res.send(session);
          } else {
            res.sendStatus(404);
          }
        })
        .catch((error) => {
          console.log(e);
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

router.get("/tests/:sessionName", (req, res) => {
  const adminSecret = req.headers.authorization;

  if (adminSecret === process.env.ADMIN_SECRET) {
    try {
      Test.find(
        {
          environment: process.env.NODE_ENV,
          session: req.params.sessionName,
        },
        { session: 0, environment: 0, _id: 0 },
        { sort: { orderNumber: 1 } }
      )
        .then((tests) => {
          if (tests.length > 0) {
            /*let orderedUsers = [];
            users.forEach((user) => {
              orderedUsers.push({
                code: user.code,
                firstName: user.firstName,
                mail: user.mail,
              });
            });
            res.send(orderedUsers);*/
            res.send(tests);
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

router.get("/status/:sessionName", async (req, res) => {
  const retrievedSession = await Session.findOne({
    name: req.params.sessionName,
    environment: process.env.NODE_ENV,
  });
  if (retrievedSession != null) {
    res.send({
      exists: true,
      active: retrievedSession.active,
      running: retrievedSession.running,
    });
  } else {
    res.send({
      exists: false,
    });
  }
});
router.get("/analytics/:sessionName", async (req, res) => {
  Logger.dbg("Analytics requested for session: "+req.params.sessionName);
  const adminSecret = req.headers.authorization;

  if (adminSecret !== process.env.ADMIN_SECRET) {
    Logger.dbg("Unauthorized access to analitycs");
    res.sendStatus(401);
    return;
  }

  const retrievedSession = await Session.findOne({
    name: req.params.sessionName,
    environment: process.env.NODE_ENV,
  });

  if (retrievedSession == null) {
    Logger.dbg("Session not found");
    res.sendStatus(404).send("Session not found");
    return;
  }

  Logger.dbg("Session found");

  const timelogs = await Log.find({
    environment: process.env.NODE_ENV,
    category: "Timing",
    createdBy: req.params.sessionName,
  }).sort({ timestamp: -1 }).limit(4);

  if (timelogs == null || timelogs.length < 4) {
    Logger.dbg("Not enough timelogs, session hasn't finished yet");
    res.sendStatus(404).send("Not enough timelogs, session hasn't finished yet");
    return;
  }

  const times = {
    t1a: timelogs.filter((log) => log.payload == "T1A")[0].timestamp,
    t1b: timelogs.filter((log) => log.payload == "T1B")[0].timestamp,
    t2a: timelogs.filter((log) => log.payload == "T2A")[0].timestamp,
    t2b: timelogs.filter((log) => log.payload == "T2B")[0].timestamp,
  }

  Logger.dbg("Times retrieved");

  if (times.t1a == null || times.t1b == null || times.t2a == null || times.t2b == null) {
    Logger.dbg("Not enough timelogs, session hasn't finished yet or is corrupted");
    res.sendStatus(404).send("Not enough timelogs, session hasn't finished yet or is corrupted");
    return;
  }

  const allLogs = await Log.find({
    environment: process.env.NODE_ENV,
    timestamp: { $gte: times.t1a, $lte: times.t2b },
  });
  Logger.dbg("All logs retrieved, in total: "+allLogs.length+" logs");
  const participants = await User.find({
    environment: process.env.NODE_ENV,
    subject: req.params.sessionName,
  });
  Logger.dbg("All participants retrieved, in total: ", participants.length);
  const t1logs = await Log.find({
    environment: process.env.NODE_ENV,
    timestamp: { $gte: times.t1a, $lte: times.t1b },
  });

  const t2logs = await Log.find({
    environment: process.env.NODE_ENV,
    timestamp: { $gte: times.t2a, $lte: times.t2b },
  });

  Logger.dbg("T1 logs retrieved, in total: ", t1logs.length);
  Logger.dbg("T2 logs retrieved, in total: ", t2logs.length);

  const rows = [];
  for (const participant of participants) {
    const partner = participants.find((p) => p.room == participant.room && p.code != participant.code);
    if (partner == null) {
      continue;
    }
    var rowt1 = {};
    rowt1.id = participant.code;
    rowt1.group = participant.blind ? "ctrl" : "exp";
    rowt1.time = "t1";
    rowt1.ipgender = rowt1.group == "ctrl" ? "none" : partner.shown_gender;
    rowt1.gender = participant.gender;
    rowt1.partnerid = partner.code;
    rowt1.dm = t1logs.filter((log) => log.createdBy == participant.code && log.category == "Chat").length;
    rowt1.okv = t1logs.filter((log) => log.createdBy == participant.code && log.category == "Verify" && log.payload == true).length;
    rowt1.kov = t1logs.filter((log) => log.createdBy == participant.code && log.category == "Verify" && log.payload == false).length;
    codeLogs = t1logs.filter((log) => log.createdBy == participant.code && log.category == "Code");
    rowt1.sca = parseCodeLogs(codeLogs,"text");
    rowt1.scd = parseCodeLogs(codeLogs,"removed");
    controlLogs = t1logs.filter((log) =>log.category == "Control" && log.payload.room == participant.room);
    rowt1.ct = controlLogs.filter((log) => log.createdBy == participant.code).length;
    rowt1.ct_sec = parseControlLogs(controlLogs, participant.code, times.t1b);
        
    rows.push(rowt1);

    var rowt2 = {};
    rowt2.id = participant.code;
    rowt2.group = participant.blind ? "ctrl" : "exp";
    rowt2.time = "t2";
    rowt2.ipgender = rowt2.group == "ctrl" ? "none" : oppositeGender(partner.shown_gender);
    rowt2.gender = participant.gender;
    rowt2.partnerid = partner.code;
    rowt2.dm = t2logs.filter((log) => log.createdBy == participant.code && log.category == "Chat").length;
    rowt2.okv = t2logs.filter((log) => log.createdBy == participant.code && log.category == "Verify" && log.payload == true).length;
    rowt2.kov = t2logs.filter((log) => log.createdBy == participant.code && log.category == "Verify" && log.payload == false).length;
    codeLogs = t2logs.filter((log) => log.createdBy == participant.code && log.category == "Code");
    rowt2.sca = parseCodeLogs(codeLogs,"text");
    rowt2.scd = parseCodeLogs(codeLogs,"removed");
    controlLogs = t2logs.filter((log) =>log.category == "Control" && log.payload.room == participant.room);
    rowt2.ct = controlLogs.filter((log) => log.createdBy == participant.code).length;
    rowt2.ct_sec = parseControlLogs(controlLogs, participant.code, times.t2b);

    rows.push(rowt2);
  }

  var rowsFull = enrichWithRatio(rows);

  res.send(rowsFull);

});


router.get("/sessions/:sessionName/:type", async (req, res) => {
  const adminSecret = req.headers.authorization;

  if (adminSecret === process.env.ADMIN_SECRET) {
    try {
      console.log("Retrieving reports");
      const users = await User.find({
        environment: process.env.NODE_ENV,
        subject: req.params.sessionName,
      });
      let userSorted = [];
      const actions = users.map(async (user) => {
        let data = await getTotalMessagesFromUser(user.code, req.params.type);
        if (userSorted[user.room]) {
          userSorted[user.room].push({ name: user.code, data });
        } else {
          userSorted[user.room] = [{ name: user.code, data }];
        }
      });
      const results = Promise.all(actions);
      results.then(() => {
        res.send(userSorted); // Corrected to (no respone in reports)
        // res.send(userOrdered); TODO: Corrected from
      });
    } catch (e) {
      console.log(e);
      res.sendStatus(500);
    }
  } else {
    res.sendStatus(401);
  }
});

router.post("/sessions", (req, res) => {
  const adminSecret = req.headers.authorization;

  if (adminSecret === process.env.ADMIN_SECRET) {
    try {
      let newSession = new Session();
      newSession.environment = process.env.NODE_ENV;
      newSession.active = false;
      newSession.name = req.body.name;
      newSession.tokens = req.body.tokens;
      newSession.tokenPairing = req.body.tokenPairing;
      newSession.isStandard = req.body.isStandard || false;
      newSession.finishMessage =
        req.body.finishMessage ||
        "Thank you for participating in this session. We hope that you find it interesting. For further questions about the session, reach out to the organizers via email.";
      newSession.registrationText =
        req.body.registrationText ||
        `Thank you for registering to session ${newSession.name}. A confirmation email has been sent to you. The organizers will tell you when does the session start.`;
      newSession
        .save()
        .then((session) => {
          res.send(session);
        })
        .catch((error) => {
          let errorMsg = "Something bad happened...";
          if (error.code === 11000) {
            errorMsg = "You should choose another name that is not duplicated.";
          } else if (error.message) {
            errorMsg = error.message;
          }
          res.status(400).send({ errorMsg });
        });
    } catch (e) {
      console.log(e);
      res.sendStatus(500);
    }
  } else {
    res.sendStatus(401);
  }
});

router.post("/tests", (req, res) => {
  const adminSecret = req.headers.authorization;

  if (adminSecret === process.env.ADMIN_SECRET) {
    try {
      let newTest = new Test();
      newTest.environment = process.env.NODE_ENV;
      newTest.session = req.body.session;
      newTest.name = req.body.name;
      newTest.description = req.body.description;
      newTest.orderNumber = req.body.orderNumber;
      newTest.time = req.body.time;
      newTest.peerChange = req.body.peerChange;
      newTest.exercises = req.body.exercises;
      newTest.language = req.body.language;
      newTest.type = req.body.type;
      newTest
        .save()
        .then((test) => {
          res.send(test);
        })
        .catch((error) => {
          let errorMsg = "Something bad happened...";
          if (error.code === 11000) {
            errorMsg = "You should choose another name that is not duplicated.";
          } else if (error.message) {
            errorMsg = error.message;
          }
          res.status(400).send({ errorMsg });
        });
    } catch (e) {
      console.log(e);
      res.sendStatus(500);
    }
  } else {
    res.sendStatus(401);
  }
});

router.post("/resetSession", async (req, res) => {
  const adminSecret = req.headers.authorization;

  if (adminSecret === process.env.ADMIN_SECRET) {
    await Session.collection.updateOne(
      {
        name: req.body.session,
        environment: process.env.NODE_ENV,
      },
      { $set: { testCounter: 0, exerciseCounter: -1, running: false } },
      { multi: false, safe: true }
    );
    const users = await User.collection.updateMany(
      { subject: req.body.session, environment: process.env.NODE_ENV },
      { $unset: { token: true, socketId: true, room: true, blind: true } },
      { $set: { nextExercise: false, visitedPExercises: [], visitedIExercises: [], shown_gender: Math.round(Math.random()) == 0 ? "Female" : "Male"} },
      { multi: true, safe: true }
    );
    res.send(users);

    console.log("Session " + req.body.session + " reset completed");
  } else {
    res.sendStatus(401);
  }
});

router.post("/startSession/:sessionName", async (req, res) => {
  const adminSecret = req.headers.authorization;

  if (adminSecret === process.env.ADMIN_SECRET) {
    consumer.startSession(req.params.sessionName, req.app._io);
    res.send({ msg: "Session started" });
  } else {
    res.sendStatus(401);
  }
});

router.put("/tests/:sessionName", (req, res) => {
  const adminSecret = req.headers.authorization;

  if (adminSecret === process.env.ADMIN_SECRET) {
    try {
      Test.findOneAndUpdate(
        {
          environment: process.env.NODE_ENV,
          session: req.params.sessionName,
          orderNumber: req.body.orderNumber,
        },
        req.body
      )
        .then((test) => {
          res.send(test);
        })
        .catch((error) => {
          let errorMsg = "Something bad happened...";
          if (error.code === 11000) {
            errorMsg = "You should choose another name that is not duplicated.";
          } else if (error.message) {
            errorMsg = error.message;
          }
          res.status(400).send({ errorMsg });
        });
    } catch (e) {
      console.log(e);
      res.sendStatus(500);
    }
  } else {
    res.sendStatus(401);
  }
});

router.put("/sessions/:sessionName/toggleActivation", (req, res) => {
  const adminSecret = req.headers.authorization;

  if (adminSecret === process.env.ADMIN_SECRET) {
    try {
      Session.findOne({
        environment: process.env.NODE_ENV,
        name: req.params.sessionName,
      })
        .then((session) => {
          session.active = !session.active;

          session
            .save()
            .then((ret) => {
              res.send(session);
            })
            .catch((error) => {
              let errorMsg = "Something bad happened...";
              if (error.message) {
                errorMsg = error.message;
              }
              res.status(500).send({ errorMsg });
            });
        })
        .catch((error) => {
          let errorMsg = "Something bad happened...";
          if (error.message) {
            errorMsg = error.message;
          }
          res.status(400).send({ errorMsg });
        });
    } catch (e) {
      console.log(e);
      res.sendStatus(500);
    }
  } else {
    res.sendStatus(401);
  }
});

router.put("/sessions/:sessionName", (req, res) => {
  const adminSecret = req.headers.authorization;

  if (adminSecret === process.env.ADMIN_SECRET) {
    try {
      Session.findOne({
        environment: process.env.NODE_ENV,
        name: req.params.sessionName,
      })
        .then((session) => {
          console.log(
            "Session found in DB: " + JSON.stringify(session, null, 2)
          );

          console.log(
            "Session data to be updated: " + JSON.stringify(req.body, null, 2)
          );

          session.tokens = req.body.tokens;
          session.tokenPairing = req.body.tokenPairing;
          session.blindParticipant = req.body.blindParticipant;
          session.isStandard = req.body.isStandard ?? true;

          console.log("Session updated: " + JSON.stringify(session, null, 2));

          session
            .save()
            .then((ret) => {
              res.send(session);
            })
            .catch((error) => {
              let errorMsg = "Something bad happened...";
              if (error.message) {
                errorMsg = error.message;
              }
              res.status(500).send({ errorMsg });
            });
        })
        .catch((error) => {
          let errorMsg = "Something bad happened...";
          if (error.message) {
            errorMsg = error.message;
          }
          res.status(400).send({ errorMsg });
        });
    } catch (e) {
      console.log(e);
      res.sendStatus(500);
    }
  } else {
    res.sendStatus(401);
  }
});

/**
 * TESTS
 */

router.post("/tests", (req, res) => {
  const adminSecret = req.headers.authorization;

  if (adminSecret === process.env.ADMIN_SECRET) {
    try {
      let newTest = new Test();
      newTest.environment = process.env.NODE_ENV;
      newTest.session = req.body.session;
      newTest.name = req.body.name;
      newTest.description = req.body.description;
      newTest.orderNumber = req.body.orderNumber;
      newTest.time = req.body.time;
      newTest.peerChange = req.body.peerChange;
      newTest.exercises = req.body.exercises;
      newTest.type = req.body.type;
      newTest
        .save()
        .then((test) => {
          res.send(test);
        })
        .catch((error) => {
          let errorMsg = "Something bad happened...";
          if (error.code === 11000) {
            errorMsg = "You should choose another name that is not duplicated.";
          } else if (error.message) {
            errorMsg = error.message;
          }
          res.status(400).send({ errorMsg });
        });
    } catch (e) {
      console.log(e);
      res.sendStatus(500);
    }
  } else {
    res.sendStatus(401);
  }
});

router.get("/tests/:sessionName", (req, res) => {
  const adminSecret = req.headers.authorization;

  if (adminSecret === process.env.ADMIN_SECRET) {
    try {
      Test.find(
        {
          environment: process.env.NODE_ENV,
          session: req.params.sessionName,
        },
        { session: 0, environment: 0, _id: 0 },
        { sort: { orderNumber: 1 } }
      )
        .then((tests) => {
          if (tests.length > 0) {
            /*let orderedUsers = [];
            users.forEach((user) => {
              orderedUsers.push({
                code: user.code,
                firstName: user.firstName,
                mail: user.mail,
              });
            });
            res.send(orderedUsers);*/
            res.send(tests);
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

router.put("/tests/:sessionName", (req, res) => {
  const adminSecret = req.headers.authorization;

  if (adminSecret === process.env.ADMIN_SECRET) {
    req.body.orderNumber = parseInt(req.body.orderNumber);
    req.body.time = parseInt(req.body.time);
    req.body.exercises.forEach(e => {
      e.time = parseInt(e.time);
    });

    Test.findOneAndUpdate(
      {
        environment: process.env.NODE_ENV,
        session: req.params.sessionName,
        orderNumber: req.body.orderNumber,
      },
      req.body
      , function (err, test) {
        if (err) {
          if (err.name == 'ValidationError') {
            res.status(422).send(err);
          }
          else {
            res.status(500).send(err);
          }
        }
        else {
          res.status(200).json(test);
        }
      });
  }
});


router.delete("/tests/:sessionName/:orderNumber", (req, res) => {
  const adminSecret = req.headers.authorization;

  if (adminSecret === process.env.ADMIN_SECRET) {
    try {
      const result = {
        removed: {},
        updated: {}
      }
      Test.findOneAndRemove({
        environment: process.env.NODE_ENV,
        session: req.params.sessionName,
        orderNumber: req.params.orderNumber,
      })
        .then((response) => {
          result.removed = response;
        })
        .catch((error) => {
          let errorMsg = "Something bad happened...";
          if (error.message) {
            errorMsg = error.message;
          }
          res.status(400).send({ errorMsg });
          return;
        });
      
      Test.updateMany({
        environment: process.env.NODE_ENV,
        session: req.params.sessionName,
        orderNumber: { $gt: req.params.orderNumber }
      }, {
        $inc: { orderNumber: -1 }
      })
        .then((response) => {
          result.updated = response;
          res.send(response);
        })
        .catch((error) => {
          let errorMsg = "Something bad happened...";
          if (error.message) {
            errorMsg = error.message;
          }
          res.status(400).send({ errorMsg });
          return;
        }
        );
    } catch (e) {
      console.log(e);
      res.sendStatus(500);
    }
  } else {
    res.sendStatus(401);
  }
});

router.get("/tests/:sessionName/:orderNumber", async (req, res) => {
  const adminSecret = req.headers.authorization;

  if (adminSecret === process.env.ADMIN_SECRET) {
    consumer.startSession(req.params.sessionName, req.app._io);
    res.send({ msg: "Session started" });
  } else {
    res.sendStatus(401);
  }
});

router.delete("/tests/exercise/:exercise", (req, res) => {
  const adminSecret = req.headers.authorization;

  if (adminSecret === process.env.ADMIN_SECRET) {
    try {
      Test.findOneAndRemove({
        environment: process.env.NODE_ENV,
        session: req.params.sessionName,
        orderNumber: req.params.orderNumber,
        exercise: req.params.exercise
      })
        .then((response) => {
          res.status(200).send(response);
        })
        .catch((error) => {
          let errorMsg = "Something bad happened...";
          if (error.message) {
            errorMsg = error.message;
          }
          res.status(400).send({ errorMsg });
        });
    } catch (e) {
      console.log(e);
      res.sendStatus(500);
    }
  } else {
    res.sendStatus(401);
  }
});

router.delete("/tests/:sessionName/:orderNumber/:exercise/:validation", (req, res) => {
  const adminSecret = req.headers.authorization;

  if (adminSecret === process.env.ADMIN_SECRET) {
    try {
      Test.findOneAndRemove({
        environment: process.env.NODE_ENV,
        session: req.params.sessionName,
        orderNumber: req.params.orderNumber,
        exercise: req.params.exercise,
        validation: req.params.validation
      })
        .then((response) => {
          res.send(response);
        })
        .catch((error) => {
          let errorMsg = "Something bad happened...";
          if (error.message) {
            errorMsg = error.message;
          }
          res.status(400).send({ errorMsg });
        });
    } catch (e) {
      console.log(e);
      res.sendStatus(500);
    }
  } else {
    res.sendStatus(401);
  }
});

router.delete("/sessions/:sessionName", (req, res) => {
  const adminSecret = req.headers.authorization;

  const result = {};

  if (adminSecret === process.env.ADMIN_SECRET) {
    try {
      Session.findOneAndRemove({
        environment: process.env.NODE_ENV,
        name: req.params.sessionName,
      })
        .then((response) => {
          result.session = response;
        })
        .catch((error) => {
          let errorMsg = "Something bad happened...";
          if (error.message) {
            errorMsg = error.message;
          }
          res.status(400).send({ errorMsg });
          return;
        });

      Test.deleteMany({
        environment: process.env.NODE_ENV,
        session: req.params.sessionName,
      })
        .then((response) => {
          result.tests = response;
          res.send(result);
        }
        )
        .catch((error) => {
          let errorMsg = "Something bad happened...";
          if (error.message) {
            errorMsg = error.message;
          }
          res.status(400).send({ errorMsg });
          return;
        }
        );
      
    } catch (e) {
      console.log(e);
      res.sendStatus(500);
    }
  } else {
    res.sendStatus(401);
  }
});

/**
 * EXERCISES
 */

router.get("/tests/:testName/exercise/:exerciseId", async (req, res) => {
  await Test.findOne({
    name: req.params.sessionName,
    environment: process.env.NODE_ENV,
  }, async function (err, exercise) {
    if (err) {
      if (err.name == 'ValidationError') {
        res.status(422).send(err);
      } else {
        res.status(500).send(err);
      }
    } else {
      Exercise.
        res.status(200).json(exercise);
    }
  });
});



module.exports = router;

// Auxiliary functions

function getTotalMessages(test, exercise, userArray) {
  const actions = userArray.map((users) => {
    return Log.aggregate([
      {
        $match: {
          environment: process.env.NODE_ENV,
          category: "Chat",
          test,
          exercise,
          createdBy: { $in: users },
        },
      },
      {
        $group: {
          _id: "$createdBy",
          totalMessages: {
            $sum: 1,
          },
        },
      },
    ]).sort({ _id: -1 });
  });
  let results = Promise.all(actions);
  return results;
}

function getTestsFromSession(sessionName) {
  return Test.find({
    environment: process.env.NODE_ENV,
    session: sessionName,
  })
    .sort({ orderNumber: 1 })
    .then((tests) => {
      const exercisesForEachTest = [];
      tests.forEach((test, i) => {
        exercisesForEachTest[i] = test.exercises.length;
      });
      return exercisesForEachTest;
    });
}

function getTotalMessages(user, test, exercise, type) {
  let matchObj = {};
  if (type == "deletions") {
    matchObj = {
      environment: process.env.NODE_ENV,
      exercise: exercise,
      category: "Code",
      "payload.change.origin": "+delete",
      test: test,
      createdBy: user,
    };
  } else if (type == "inputs") {
    matchObj = {
      environment: process.env.NODE_ENV,
      category: "Code",
      exercise: exercise,
      test: test,
      "payload.change.origin": "+input",
      createdBy: user,
    };
  } else if (type == "messages") {
    matchObj = {
      environment: process.env.NODE_ENV,
      category: "Chat",
      exercise: exercise,
      test: test,
      createdBy: user,
    };
  } else if (type == "wrongs") {
    matchObj = {
      environment: process.env.NODE_ENV,
      category: "Verify",
      exercise: exercise,
      test: test,
      payload: false,
      createdBy: user,
    };
  } else if (type == "rights") {
    matchObj = {
      environment: process.env.NODE_ENV,
      category: "Verify",
      exercise: exercise,
      test: test,
      payload: true,
      createdBy: user,
    };
  }
  return Log.aggregate([
    {
      $match: matchObj,
    },
    {
      $group: {
        _id: "$createdBy",
        messages: {
          $sum: 1,
        },
      },
    },
  ]).then((result) => {
    if (result.length == 0) {
      return 0;
    } else {
      return result[0].messages;
    }
  });
}

function getTotalMessagesCsv(user, test, exercise, type) {
  let matchObj = {};
  if (type == "deletions") {
    matchObj = {
      environment: process.env.NODE_ENV,
      exercise: exercise,
      category: "Code",
      "payload.change.origin": "+delete",
      test: test,
      createdBy: user,
    };
  } else if (type == "inputs") {
    matchObj = {
      environment: process.env.NODE_ENV,
      category: "Code",
      exercise: exercise,
      test: test,
      "payload.change.origin": "+input",
      createdBy: user,
    };
  } else if (type == "messages") {
    matchObj = {
      environment: process.env.NODE_ENV,
      category: "Chat",
      exercise: exercise,
      test: test,
      createdBy: user,
    };
  } else if (type == "wrongs") {
    matchObj = {
      environment: process.env.NODE_ENV,
      category: "Verify",
      exercise: exercise,
      test: test,
      payload: false,
      createdBy: user,
    };
  } else if (type == "rights") {
    matchObj = {
      environment: process.env.NODE_ENV,
      category: "Verify",
      exercise: exercise,
      test: test,
      payload: true,
      createdBy: user,
    };
  }
  return Log.aggregate([
    {
      $match: matchObj,
    },
    {
      $group: {
        _id: "$createdBy",
        messages: {
          $sum: 1,
        },
      },
    },
  ]).then((result) => {
    let resultObj = [];
    if (result.length == 0) {
      resultObj[(1 + exercise) + "-" + (test + 1)] = 0
    } else {
      resultObj[(1 + exercise) + "-" + (test + 1)] = result[0].messages
    }
    return resultObj;
  });
}

async function getTotalMessagesFromUser(userCode, type) {
  try {
    const user = await User.findOne({
      environment: process.env.NODE_ENV,
      code: userCode,
    });
    if (user) {
      const exercisesForEachTest = await getTestsFromSession(user.subject);
      let report = {
        name: user.code,
        data: [],
      };
      let promises = [];
      exercisesForEachTest.map((exercises, test) => {
        for (let i = 0; i <= exercises; i++) {
          promises.push(getTotalMessages(user.code, test, i, type));
        }
      });
      const results = await Promise.all(promises);
      return results;
    } else {
      return {};
    }
  } catch (e) {
    console.log(e);
  }
}

async function getTotalMessagesFromUserCsv(userCode, type) {
  try {
    const user = await User.findOne({
      environment: process.env.NODE_ENV,
      code: userCode,
    });
    if (user) {
      const exercisesForEachTest = await getTestsFromSession(user.subject);
      let promises = [];
      exercisesForEachTest.map((exercises, test) => {
        // for (let i = 0; i <= exercises; i++) { //TODO: changed from
        for (let i = 0; i < exercises; i++) { //Changed to
          promises.push(getTotalMessagesCsv(user.code, test, i, type));
        }
      });
      const results = await Promise.all(promises);
      let dataStream = [];
      for (let i = 0; i < exercisesForEachTest.reduce((a, b) => a + b); i++) {
        let key = Object.keys(results[i]);
        let value = Object.values(results[i])[0];
        let obj = { [key]: value }
        dataStream.push(obj);
      }
      return dataStream;
    } else {
      return {};
    }
  } catch (e) {
    console.log(e);
  }
}


router.get("/dataset/:sessionName", async (req, res) => {
  const adminSecret = req.headers.authorization;

  if (adminSecret === process.env.ADMIN_SECRET) {
    try {
      console.log("Retrieving reports in csv");
      const users = await User.find({
        environment: process.env.NODE_ENV,
        subject: req.params.sessionName,
      });
      var userSorted = [];
      let types = ["messages", "rights", "deletions", "inputs", "wrongs"];
      const actions = users.map(async (user) => {
        let data = [];
        for (var i = 0; i < types.length; i++) {
          data[types[i]] = await getTotalMessagesFromUserCsv(user.code, types[i]);
        }

        userSorted.push({
          code: user.code,
          mail: user.mail,
          gender: user.gender,
          birthDate: user.birthDate,
          subject: req.params.sessionName,
          beganStudying: user.beganStudying,
          numberOfSubjects: user.numberOfSubjects,
          knownLanguages: user.knownLanguages,
          signedUpOn: user.signedUpOn,
          token: user.token,
          room: user.room,
          blind: user.blind,
          jsexp: user.jsexp,
          data: data,
        });

      });

      const results = Promise.all(actions);
      results.then(() => {
        let dataUsers = [];
        for (let i = 0; i < userSorted.length; i++) {
          dataUsers[i] = userSorted[i].data;
        }
        let calc = calculateStudentsData(dataUsers);
        generateDictionary(calc, userSorted);

        res.send(userSorted);
        writeCsv(userSorted);
      });
    } catch (e) {
      console.log(e);
      res.sendStatus(500);
    }
  } else {
    res.sendStatus(401);
  }
});

function generateDictionary(data, userSorted) {
  
  for (let i = 0; i < userSorted.length; i++) { //loop over students
    for (let j = 0; j < data.length; j++) { //loop over student types
      let tipo = data[j]; //gets type
      let key = Object.keys(tipo)[0];
      let value = Object.values(data[Object.keys(data)[j]])[0];
      let values = [];
      
      // Save values of type and adds final sum
      for (let y = 0; y < Object.keys(value).length; y++) {
        let ky = Object.keys(value)[y];
        let v = Object.values(value)[y];
        values.push({ [ky + '-T']: v });
      }
      userSorted[i][key] = userSorted[i].data[key].concat(values);
      for (let l = 0; l < userSorted[i][key].length; l++) {
        let m = Object.keys(userSorted[i][key][l])[0];
        userSorted[i][key + m] = Object.values(userSorted[i][key][l])[0];
      }
      delete userSorted[i][key];
    }
    delete userSorted[i].data;
  }
}

function calculateStudentsData(data) {

  var keys = [];
  var objects = Object.values(data[0])[0];
  var dataType = [];
  var types = ["messages", "rights", "deletions", "inputs", "wrongs"];

  for (var j = 0; j < objects.length; j++) {
    keys[j] = Object.keys(objects[j])[0];
  }

  for (var k = 0; k < types.length; k++) { //Loop over type logs
    var dataFinal = [];
    var type = types[k]; //type

    //For each type we call the exercise calculus of each test (for the students in the session)
    const result = dataStudents(data, type, keys);

    var obj = { [type]: result };
    dataType.push(obj);
    dataFinal.push(obj);
  }
  return dataType;
}

function dataStudents(data, type, keys) {
  var result = [];

  var p = Object.values(data[0])[0];
  for (var j = 0; j < p.length; j++) {
    result[Object.keys(p[j])] = 0;
  }

  for (var i = 0; i < data.length; i++) { //Loop over students
    // Structure to save the values of each type
    for (var k = 0; k < keys.length; k++) { //Loop over student metrics
      var key = keys[k]; //key 1-1
      var values = Object.values(data[i][type]); //Values of the student i and type
      result[key] += values[k][key];
    }
  }
  return result;
}

function oppositeGender(gender) {
  if(gender == "Female") {
    return "Male";
  } else {
    return "Female";
  }
}

function parseCodeLogs(logs,field){
          
  return logs.reduce( (total,l) => {

    var count = 0; 
    try {

      for(var i=0;i< l.payload.change[field].length; i++){
        var changes = l.payload.change[field][i].length;
        count += changes;
      }

      return total+count;

    }catch (error) {
      console.error("Error calculating <"+field+"> count:"+error);
      console.error("total: "+JSON.stringify(total,null,2));
      console.error("l: "+JSON.stringify(l,null,2));
    }

  },0);

}

function parseControlLogs(logs,code,end) {
  Logger.dbg("START - parseControlLogs: "+code);
  var totalMiliseconds = 0;
  const orderedLogs = logs.sort((a,b) => {
    return new Date(a.timestamp) - new Date(b.timestamp);
  })
  var lastTimestamp = null;
  var lastCode = null;
  for(var i=0; i<orderedLogs.length; i++) {

    if(i == orderedLogs.length - 1 && orderedLogs[i].createdBy == code) {
      totalMiliseconds += new Date(end) - new Date(orderedLogs[i].timestamp);
      continue;
    }

    if(orderedLogs[i].createdBy == code && (lastCode == null || lastCode != code)) {
      lastCode = orderedLogs[i].createdBy;
      lastTimestamp = orderedLogs[i].timestamp;
    } else if (orderedLogs[i].createdBy != code && lastCode == code) {
      totalMiliseconds += new Date(orderedLogs[i].timestamp) - new Date(lastTimestamp);
      lastCode = orderedLogs[i].createdBy;
    }
  }
  return totalMiliseconds / 1000;
}

function enrichWithRatio(rows) {
  var dict = Object.fromEntries(rows.map(row => [row.time + row.id, row]));

  for( var i=0; i<rows.length; i++) {
    var partnerRow = dict[rows[i].time + rows[i].partnerid];
    if(partnerRow) {
      rows[i].dm_rf = rows[i].dm == 0? 0:rows[i].dm / (rows[i].dm + partnerRow.dm);
      rows[i].okv_rf = rows[i].okv == 0? 0:rows[i].okv / (rows[i].okv + partnerRow.okv);
      rows[i].kov_rf = rows[i].kov == 0? 0:rows[i].kov / (rows[i].kov + partnerRow.kov);
      rows[i].sca_rf = rows[i].sca == 0? 0:rows[i].sca / (rows[i].sca + partnerRow.sca);
      rows[i].scd_rf = rows[i].scd == 0? 0:rows[i].scd / (rows[i].scd + partnerRow.scd);
      rows[i].ct_rf = rows[i].ct_sec == 0? 0:rows[i].ct_sec / (rows[i].ct_sec + partnerRow.ct_sec);
      Logger.dbg("ct "+rows[i].ct+" partner ct "+partnerRow.ct+" ratio "+rows[i].ct_rf)
    } else {
      rows[i].dm_rf = 0;
      rows[i].okv_rf = 0;
      rows[i].kov_rf = 0;
      rows[i].sca_rf = 0;
      rows[i].scd_rf = 0;
      rows[i].ct_rf = 0;
    }
  }

  return rows;
}

function writeCsv(userSorted) {

  var keys = Object.keys(userSorted[0]);
  var header = [];
  for (let n = 0; n < keys.length; n++) {
    header.push({
      id: keys[n],
      title: keys[n].toUpperCase()
    });
  }
  // Passing the column names intp the module
  const csvWriter = createCsvWriter({

    // Output csv file name is geek_data
    path: 'data.csv',
    header: header
  });

  // Write records function to add records
  csvWriter
    .writeRecords(userSorted)
    .then(() => console.log('Data uploaded into csv successfully'));


}
