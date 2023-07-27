require("dotenv").config();
var express = require("express");
const router = express.Router();
const Test = require("../models/Test.js");
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

router.post("/verify/log", async (req, res) => {
  Logger.dbg("/verify/log",req.body);
  const user = await User.findOne({
    code: req.body.user,
    environment: process.env.NODE_ENV,
  });

  if (user) {
    let session = await Session.findOne({
      name: user.subject,
      environment: process.env.NODE_ENV,
    });
    
    if (session) {
      Logger.log(
        "Verify",
        user.code,
        req.body.status,
        session.exerciseCounter,
        session.testCounter
      );
      res.sendStatus(200);
    } else {
      Logger.dbg("/verify/log - Session not found");
      res.sendStatus(404);
    }
  } else {
    Logger.dbg("/verify/log - User not found");
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
    let session = await Session.findOne({
      name: user.subject,
      environment: process.env.NODE_ENV,
    });

    Logger.dbg("/verify - Trying to validate " + session.testCounter + " " + session.exerciseCounter);

    var numTest = session.testCounter;
    if (session.isStandard && session.testCounter == 2) numTest = 0; 

    const test = await Test.findOne({
      orderNumber: numTest,
      environment: process.env.NODE_ENV,
      session: user.subject,
    });

    var numExercise = session.exerciseCounter - 1;
    if (session.isStandard && (numTest == 0 || numTest == 2)) numExercise = user.visitedPExercises[user.visitedPExercises.length - 1];
    else if (session.isStandard && numTest == 1) numExercise = user.visitedIExercises[user.visitedIExercises.length - 1];
    
    var exercise;
    test.exercises.forEach(exer => {
      if (exer.description == req.body.exerciseDescription) exercise = exer;
    });

    if (exercise) {
      Logger.dbg("/verify - Validate exercise:\n  " + exercise.description.substring(0,Math.min(80,exercise.description.length))+"...");

      const solutions = exercise.solutions;

      let isCorrect = true;
      
      var numCorrect = 0; /** NEW */
      var numWrong = 0;
      var tot = solutions.length;

      for (var i = 0; i < solutions.length; i++) {
        
        let correctSolution = JSON.stringify(solutions[i]) === JSON.stringify(req.body.solutions[i]);
        
        isCorrect = isCorrect && correctSolution;

        if (correctSolution) numCorrect++;
        else numWrong++;
  
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

      
      if(isCorrect && req.body.source){
        var twccScore = 10000;

        try{
          twccResult = escomplex.analyse(req.body.source);

          if(twccResult.functions.length > 0){
            twccResult.functions.forEach((f)=>{
              if(f.name=="main"){
                twccScore = Math.floor(f.cyclomatic*f.halstead.difficulty);
              }
            });   
          } 
  
        }catch(e){
          Logger.dbg("/verify - ERROR obtaining TWCC",e);
        }

        Logger.dbg("/verify - "+((isCorrect)?("CORRECT , score: "+twccScore):"wrong"));
        
        Logger.log(
          "VerifyQuality",
          user.code,
          twccScore,
          session.exerciseCounter,
          session.testCounter
        );

        res.send({ result: isCorrect, twcc: twccScore, numCorrect: numCorrect, numWrong: numWrong, tot: tot });        
      }else{
        res.send({ result: isCorrect, numCorrect: numCorrect, numWrong: numWrong, tot: tot });
      }

    } else {
      res.sendStatus(404);
    }
  } else {
    res.sendStatus(404);
  }
});

module.exports = router;
