require("dotenv").config();
var express = require("express");
const router = express.Router();
const Test = require("../models/Test.js");
const Logger = require("../logger.js");
const User = require("../models/User.js");
const Room = require("../models/Room.js");
const Session = require("../models/Session.js");

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
    code: req.body.user,
    environment: process.env.NODE_ENV,
  });
  Logger.dbg("/verify",req.body);
  
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

    const exercise = test.exercises[session.exerciseCounter - 1];

    if (exercise) {
      Logger.dbg("/verify - Validate exercise:\n  " + exercise.description.substring(0,Math.min(80,exercise.description.length))+"...");

      const solutions = exercise.solutions;

      let isCorrect = true;

      for (var i = 0; i < solutions.length; i++) {
        
        let correctSolution = JSON.stringify(solutions[i]) === JSON.stringify(req.body.solutions[i]);

        isCorrect = isCorrect && correctSolution;
  
        Logger.dbg("/verify - "
                   +"("+i+")" 
                   + " Submitted Solution: <"+req.body.solutions[i]+">,"
                   + " Expected Solution: <"+solutions[i]+">,"
                   + " Correct Solution: "+  correctSolution+ ","
                   + " Global verification: "+  isCorrect);
                   
      }

      Logger.log(
        "Verify",
        user.code,
        isCorrect,
        session.exerciseCounter,
        session.testCounter
      );
      res.send({ result: isCorrect });
    } else {
      res.sendStatus(404);
    }
  } else {
    res.sendStatus(404);
  }
});

module.exports = router;
