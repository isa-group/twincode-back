require("dotenv").config();
var express = require("express");
const router = express.Router();
const User = require("../models/User");
const Leia = require("../models/Leia");
const Logger = require("../logger.js");
const { faker } = require("@faker-js/faker");

faker.seed(new Date().getTime());

router.post("/participants/:sessionName/leia/:numLeias/:type", async (req, res) => {
  const adminSecret = req.headers.authorization;
  var successfullyCreated = 0;
  var errors = 0;

  if (adminSecret === process.env.ADMIN_SECRET) {
    for (var i = 0; i < req.params.numLeias; i++) {
      try {
        var generatedCode = await generateCodeInit();

        Logger.dbg("ADD BOT - Generated code: " + generatedCode);

        if (generatedCode !== null) {

          // Add 'B' to the code to identify it as a bot
          generatedCode = "B" + generatedCode;

          var participant = new User();
          participant.code = generatedCode;
          participant.firstName = "BOT";
          participant.surname = "BOT";
          participant.mail = generatedCode + ".noreply@example.com";
          participant.subject = req.params.sessionName;
          participant.environment = process.env.NODE_ENV;
          genders = ['Male', 'Female'];
          participant.gender = genders[Math.floor(Math.random() * genders.length)];
          participant.shown_gender = participant.gender;
          Logger.dbg("ADD BOT - gender: " + participant.gender);
          participant.birthDate = faker.date.birthdate({ min: 18, max: 34, mode: 'age' });
          participant.beganStudying = faker.date.past({ years: 5 }).getFullYear();

          var leia = new Leia();
          leia.code = generatedCode;
          leia.subject = req.params.sessionName;
          leia.type = req.params.type;

          const createdUser = await participant.save();
          const createdLeia = await leia.save();
          successfullyCreated++;

          Logger.dbg("ADD USER - Participant created: " + createdUser);
          Logger.dbg("ADD BOT - Leia created: " + createdLeia);

        } else {
          Logger.dbg("IMPORT PARTICIPANTS - User not created. Code couldn't generate properly...");
          errors++;
        }

      } catch (e) {
        console.log(e);
        res.sendStatus(500);
      }
    }
    res.status(201).send({ 
      created: successfullyCreated,
      errors: errors
    });

  } else {
    res.sendStatus(401);
  }
});

router.delete("/participants/:sessionName/leia/:code", async (req, res) => {
  const adminSecret = req.headers.authorization;
  if (process.env.ADMIN_SECRET === adminSecret) {
    try {
      await User.deleteOne({ code: req.params.code });
      await Leia.deleteOne({ code: req.params.code });
      res.sendStatus(200)
    } catch (e) {
      console.log(e);
      res.sendStatus(500);
    }
  }
});

generateCodeInit = async () => {
  var dateNow = new Date().toISOString();
  var formatedDate = dateNow.substring(2, 4) + dateNow.substring(5, 7);
  var code = await generateCode(formatedDate, 0);
  return code;
};

generateCode = async (formatedDate, times) => {
  if (times >= 5) {
    return null;
  }
  var code = formatedDate + Math.random().toString(36).substring(2, 8).toUpperCase();
  try {
    const exists = await User.exists({ code: code });
    if (exists) {
      return await generateCode(formatedDate, times + 1);
    } else {
      return code;
    }
  } catch (error) {
    console.error(error);
    return null;
  }
};

module.exports = router;