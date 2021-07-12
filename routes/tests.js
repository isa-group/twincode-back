require("dotenv").config();
var express = require("express");
const router = express.Router();
const Test = require("../models/Test.js");
const Exercise = require("../models/Exercise.js")
const Validation = require("../models/Validation.js");
const Logger = require("../logger.js");
const User = require("../models/User.js");
const Room = require("../models/Room.js");
const Session = require("../models/Session.js");
const escomplex = require('escomplex');

router.get("/test", async (req, res) => {
  const user = await User.findOne({
    code: req.query.code,
    environment: process.env.NODE_ENV,
  });
  if (user) {
    let room = await Room.findOne({
      name: user.room,
      session: user.subject,
      environment: process.env.NODE_ENV,
    });

    if (room === null) {
      const newRoom = new Room({
        name: user.room,
        session: user.subject,
        environment: process.env.NODE_ENV,
        lastExercise: 0,
        currentTest: 0,
      });
      await newRoom.save();
      room = newRoom;
    }

    if (!room.finished) {
      const test = await Test.findOne({
        session: user.subject,
        environment: process.env.NODE_ENV,
        orderNumber: room.currentTest,
      });

      let exercise = {};

      if (test) {
        exercise = {
          description: test.exercises[room.lastExercise].description,
          time: test.exercises[room.lastExercise].time,
          type: test.exercises[room.lastExercise].type,
        };
      }

      res.send(exercise);
    } else {
      res.send({ finished: true });
    }
  } else {
    res.sendStatus(404);
  }
});

router.post("/verify", async (req, res) => {
  const user = await User.findOne({
    code: req.body["user"],
    environment: process.env.NODE_ENV,
  });
  Logger.dbg("/verify", req.body);
  Logger.dbg("user", JSON.stringify(user));
  if (user) {
    console.log("User " + user.token);
    let session = await Session.findOne({
      name: user.subject,
      environment: process.env.NODE_ENV,
    });
    Logger.dbg("/verify - Trying to validate " + session.testCounter + " " + session.exerciseCounter);

    const test = await Test.findOne({
      orderNumber: session.testCounter,
      environment: process.env.NODE_ENV,
      session: user.subject,
    });
    

    // const exercise = test.exercises[session.exerciseCounter - 1]; //TODO: Changed from
    const exercise = test.exercises[session.exerciseCounter]; //TODO: Changed to 
    Logger.dbg("/verify - Validate exercise:\n  " + exercise);

    if (exercise) {
      Logger.dbg("/verify - Validate exercise:\n  " + exercise.description.substring(0, Math.min(80, exercise.description.length)) + "...");

      const validations = exercise.validations;

      let isCorrect = true;

      for (var i = 0; i < validations.length; i++) {
        let correctSolution = validations[i].solution === JSON.stringify(req.body.solution);
        isCorrect = isCorrect && correctSolution;

        Logger.dbg("/verify - "
          + "(" + i + ")"
          + " Submitted Solution: <" + req.body.solution + ">,"
          + " Expected Solution: <" + validations[i].solution + ">,"
          + " Correct Solution: " + correctSolution + ","
          + " Global verification: " + isCorrect);

      }

      Logger.log(
        "Verify",
        user.code,
        isCorrect,
        session.exerciseCounter,
        session.testCounter
      );


      if (isCorrect && req.body.source) {
        var twccScore = 10000;

        try {
          twccResult = escomplex.analyse(req.body.source);

          if (twccResult.functions.length > 0) {
            twccResult.functions.forEach((f) => {
              if (f.name == "main") {
                twccScore = Math.floor(f.cyclomatic * f.halstead.difficulty);
              }
            });
          }

        } catch (e) {
          Logger.dbg("/verify - ERROR obtaining TWCC", e);
        }

        Logger.dbg("/verify - " + ((isCorrect) ? ("CORRECT , score: " + twccScore) : "wrong"));

        Logger.log(
          "VerifyQuality",
          user.code,
          twccScore,
          session.exerciseCounter,
          session.testCounter
        );

        res.send({ result: isCorrect, twcc: twccScore });
      } else {
        res.send({ result: isCorrect });
      }

    } else {
      res.sendStatus(404);
    }
  } else {
    res.sendStatus(404);
  }
});


/**
 * EXERCISES
 */

router.get("/tests/:testName/exercises/:exercise", async (req, res) => {
  const adminSecret = req.headers.authorization;

  if (adminSecret === process.env.ADMIN_SECRET) {
    await Test.findOne({
      name: req.params.testName,
      environment: process.env.NODE_ENV,
    }, async function (err, test) {
      if (err) {
        if (err.name == 'ValidationError') {
          res.status(422).send(err);
        } else {
          res.status(500).send(err);
        }
      } else { //Number of exercise beggining from 0 => 1=0
        res.status(200).json(test.exercises[req.params.exercise - 1]);
      }
    });
  }
});

//Delete exercise
router.delete("/tests/:testName/exercises/:exercise", async (req, res) => {
  const adminSecret = req.headers.authorization;

  if (adminSecret === process.env.ADMIN_SECRET) {
    await Test.findOne({
      name: req.params.testName,
      environment: process.env.NODE_ENV,
    }, async function (err, test) {
      if (err) {
        if (err.name == 'ValidationError') {
          res.status(422).send(err);
        } else {
          res.status(500).send(err);
        }
      } else {
        test.exercises.splice([parseInt(req.params.exercise)], 1);
        Test.findOneAndUpdate({ name: req.params.testName },test, function (err, test) {
          if (err) {
            if (err.name == 'ValidationError') {
              res.status(422).send(err);
            } else {
              res.status(500).send(err);
            }
          } else {
            res.status(200).send(test);
          }
        });
      }
    });
  }
});

//Put exercise
router.put("/tests/:testName/exercises/:exercise", async (req, res) => {
  const adminSecret = req.headers.authorization;

  if (adminSecret === process.env.ADMIN_SECRET) {
    await Test.findOne({
      name: req.params.testName,
      environment: process.env.NODE_ENV,
    }, async function (err, test) {
      if (err) {
        if (err.name == 'ValidationError') {
          res.status(422).send(err);
        } else {
          res.status(500).send(err);
        }
      } else {
        console.log(test.exercises);
        test.exercises[req.params.exercise]= new Exercise(req.body);
        console.log(test.exercises);
        Test.findOneAndUpdate({ name: req.params.testName },test, function (err, test) {
          if (err) {
            if (err.name == 'ValidationError') {
              res.status(422).send(err);
            } else {
              res.status(500).send(err);
            }
          } else {
            res.status(200).send(test);
          }
        });
      }
    });
  }
});

//Post exercise
router.put("/tests/:testName/exercises", async (req, res) => {
  const adminSecret = req.headers.authorization;

  if (adminSecret === process.env.ADMIN_SECRET) {
    await Test.findOne({
      name: req.params.testName,
      environment: process.env.NODE_ENV,
    }, async function (err, test) {
      if (err) {
        if (err.name == 'ValidationError') {
          res.status(422).send(err);
        } else {
          res.status(500).send(err);
        }
      } else {
        changedTest = test;
        var exercise = new Exercise(req.body);
        changedTest.exercises.push(exercise);
        try{
        Test.findOneAndUpdate(
        {
          name: req.params.testName,
          environment: process.env.NODE_ENV,
        }
        ,changedTest
        ,function (err, test) {
          if (err) {
            if (err.name == 'ValidationError') {
              res.status(422).send(err);
            } else {
              res.status(500).send(err);
            }
          } else {
            res.status(200).send(test);
          }
        });
      }catch (e) {
          console.err(e);
        }
      }
    });
  }
});

//POST VALIDATION
router.post("/tests/:testName/exercises/:exercise/validations", async (req, res) => {
  const adminSecret = req.headers.authorization;

  if (adminSecret === process.env.ADMIN_SECRET) {
    await Test.findOne({
      name: req.params.testName,
      environment: process.env.NODE_ENV,
    }, async function (err, test) {
      if (err) {
        if (err.name == 'ValidationError') {
          res.status(422).send(err);
        } else {
          res.status(500).send(err);
        }
      } else {
        var newValidation = new Validation(req.body);
        test.exercises[parseInt(req.params.exercise)].validations.push(newValidation);
        Test.findOneAndUpdate({ name: req.params.testName },test, function (err, test) {
          if (err) {
            if (err.name == 'ValidationError') {
              res.status(422).send(err);
            } else {
              res.status(500).send(err);
            }
          } else {
            res.status(200).send(test);
          }
        });
      }
    });
  }
});
//DELETE VALIDATION
router.delete("/tests/:testName/exercises/:exercise/validations/:validation", async (req, res) => {
  const adminSecret = req.headers.authorization;

  if (adminSecret === process.env.ADMIN_SECRET) {
    await Test.findOne({
      name: req.params.testName,
      environment: process.env.NODE_ENV,
    }, async function (err, test) {
      if (err) {
        if (err.name == 'ValidationError') {
          res.status(422).send(err);
        } else {
          res.status(500).send(err);
        }
      } else {
        test.exercises[parseInt(req.params.exercise)].validations.splice([parseInt(req.params.validation)], 1);
        Test.findOneAndUpdate({ name: req.params.testName },test, function (err, test) {
          if (err) {
            if (err.name == 'ValidationError') {
              res.status(422).send(err);
            } else {
              res.status(500).send(err);
            }
          } else {
            res.status(200).send(test);
          }
        });
      }
    });
  }
});

router.get("/database", async (req, res) => {

  const adminSecret = req.headers.authorization;

  if (adminSecret === process.env.ADMIN_SECRET) {
    
    res.status(200).send("YES");
    // await Test.findOne({
    //   name: req.params.testName,
    //   environment: process.env.NODE_ENV,
    // }, async function (err, test) {
    //   if (err) {
    //     if (err.name == 'ValidationError') {
    //       res.status(422).send(err);
    //     } else {
    //       res.status(500).send(err);
    //     }
    //   } else { //Number of exercise beggining from 0 => 1=0
    //     res.status(200).json(test.exercises[req.params.exercise - 1]);
    //   }
    // });
  }
});

module.exports = router;
