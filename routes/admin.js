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

  const limit = parseInt(req.query.limit) || 20;
  const skip = parseInt(req.query.skip) || 0;

  if (adminSecret === process.env.ADMIN_SECRET && limit <= 20) {
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

router.get("/sessions/:sessionName/:type", async (req, res) => {
  const adminSecret = req.headers.authorization;

  if (adminSecret === process.env.ADMIN_SECRET) {
    try {
      console.log("Retrieving reports");
      const users = await User.find({
        environment: process.env.NODE_ENV,
        subject: req.params.sessionName,
      });
      let userOrdered = [];
      const actions = users.map(async (user) => {
        let data = await getTotalMessagesFromUser(user.code, req.params.type);
        if (userOrdered[user.room]) {
          userOrdered[user.room].push({ name: user.code, data });
        } else {
          userOrdered[user.room] = [{ name: user.code, data }];
        }
      });
      const results = Promise.all(actions);
      results.then(() => {
        res.send(userOrdered);
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
      { multi: true, safe: true }
    );
    res.send(users);
    console.log("Session " + req.body.session + " reset completed");
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
      Test.findOneAndRemove({
        environment: process.env.NODE_ENV,
        session: req.params.sessionName,
        orderNumber: req.params.orderNumber,
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

  if (adminSecret === process.env.ADMIN_SECRET) {
    try {
      Session.findOneAndRemove({
        environment: process.env.NODE_ENV,
        name: req.params.sessionName,
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
      tests.forEach((test, index) => {
        exercisesForEachTest[index] = test.exercises.length;
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
        for (let i = 1; i <= exercises; i++) {
          promises.push(getTotalMessages(user.code, test, i, type));
        }
      });
      const results = Promise.all(promises);
      return results;
    } else {
      return {};
    }
  } catch (e) {
    console.log(e);
  }
}
