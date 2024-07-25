require("dotenv").config();
var express = require("express");
const router = express.Router();
const Test = require("../models/Test.js");
const Logger = require("../logger.js");
const User = require("../models/User");
const nodemailer = require("nodemailer");
const { faker } = require("@faker-js/faker");

faker.seed(new Date().getTime());

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

router.delete("/participants/:sessionName/:code", (req, res) => {
  const adminSecret = req.headers.authorization;

  if (adminSecret === process.env.ADMIN_SECRET) {
    try {
      User.findOneAndRemove({
        environment: process.env.NODE_ENV,
        subject: req.params.sessionName,
        code: req.params.code,
      }).then((user) => {
        if (user) {
          res.send("Participant " + user.code + " successfully deleted!");
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

router.post("/participants/:sessionName/import", async (req, res) => {
  const adminSecret = req.headers.authorization;

  if (adminSecret === process.env.ADMIN_SECRET) {
    try {
      let users = req.body;
      let participants = [];
      let errors = 0;
      let exists = 0;
      for (const user of users) {
        try {
          const val = await User.exists({ mail: user.email, subject: req.params.sessionName, environment: process.env.NODE_ENV });

          if (!val) {
            const generatedCode = await generateCodeInit();

            Logger.dbg("IMPORT PARTICIPANTS - Generated code: " + generatedCode);

            if (generatedCode !== null) {
              var participant = new User();
              participant.code = generatedCode;
              participant.firstName = "ANONYMOUS";
              participant.surname = "ANONYMOUS";
              participant.mail = user.email;
              participant.subject = req.params.sessionName;
              participant.environment = process.env.NODE_ENV;
              participant.gender = user.gender;
              participant.shown_gender = user.gender;
              participant.birthDate = user.birthday;
              participant.beganStudying = user.studyStartYear;
              participants.push(participant);
            } else {
              Logger.dbg("IMPORT PARTICIPANTS - User not created. Code couldn't generate properly...");
              errors++;
            }
          } else {
            Logger.dbg("IMPORT PARTICIPANTS - User not created. User already exists...");
            exists++;
          }
        } catch (error) {
          Logger.dbg("IMPORT PARTICIPANTS - Error generating user from csv: " + error);
          errors++;
        }
      }

      const inserted = await User.insertMany(participants);

      Logger.dbg("IMPORT PARTICIPANTS - Participants inserted: " + inserted.length);

      const result = {
        success: inserted.length,
        errors: errors,
        exists: exists,
      };

      Logger.dbg("IMPORT PARTICIPANTS - Sending result: " + result);

      res.status(200).send(result);
    } catch (e) {
      Logger.dbg("IMPORT PARTICIPANTS - Fatal error generating users from csv: " + e);
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
        Logger.dbg("EXPORT PARTICIPANTS - Exporting participants");
        if (users.length > 0) {
          res.send(users);
        }
      });
    } catch (e) {
      Logger.dbg("EXPORT PARTICIPANTS - Error retrieving users... " + e);
      res.sendStatus(500);
    }
  } else {
    res.sendStatus(401);
  }
});

router.post("/participants/:sessionName/bot", async (req, res) => {
    const adminSecret = req.headers.authorization;
    
    if (adminSecret === process.env.ADMIN_SECRET) {
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
                genders = ['Male', 'Female']
                participant.gender = genders[Math.floor(Math.random() * genders.length)];
                participant.shown_gender = participant.gender;
                Logger.dbg("ADD BOT - gender: " + participant.gender);
                participant.birthDate = faker.date.birthdate({min: 18, max: 34, mode: 'age'});
                participant.beganStudying = faker.date.past({years: 5}).getFullYear();
                
                const created = await participant.save();
                Logger.dbg("ADD BOT - Participant created: " + created);

                res.sendStatus(200);

            } else {
                Logger.dbg("IMPORT PARTICIPANTS - User not created. Code couldn't generate properly...");
                errors++;
            }

        } catch (e) {
            console.log(e);
            res.sendStatus(500);
        }
    } else {
        res.sendStatus(401);
    }
});

router.post("/participants/:sessionName/send", async (req, res) => {
  const adminSecret = req.headers.authorization;

  if (adminSecret === process.env.ADMIN_SECRET) {
    var errors = 0;
    var success = 0;
    try {
      const users = await User.find(
        {
          environment: process.env.NODE_ENV,
          subject: req.params.sessionName,
        },
      );

      if (users) {
        Logger.dbg("SEND EMAIL TO ALL USERS 'POST' - USERS FOUND, SENDING IN PROCESS");
        for (var i = 0; i < users.length; i++) {
          const user = users[i];
          Logger.dbg("SENDING EMAIL TO ALL USERS 'POST' - Sending to: " + user.mail);
          const result = await sendUserMail(user);
          if (result) {
            success += 1;
          } else {
            errors += 1;
          }
        }
      } else {
        errors += 1;
      }


      const result = {
        errors: errors,
        success: success,
      };
      res.send(result);

    } catch (err) {
      Logger.monitorLog("ERROR - SEND EMAIL TO ALL USERS 'POST' - Error: " + err);
      res.sendStatus(500);
    }
  } else {
    Logger.dbg("SEND EMAIL TO ALL USERS 'POST' - FORBIDDEN, ADMIN TOKEN DO NOT MATCH");
    res.sendStatus(403);
  }
});


router.post("/participants/:sessionName/:mail/send", async (req, res) => {
  const adminSecret = req.headers.authorization;

  if (adminSecret === process.env.ADMIN_SECRET) {
    try {
      const user = await User.findOne({
        environment: process.env.NODE_ENV,
        subject: req.params.sessionName,
        mail: req.params.mail,
      });

      if (user) {
        Logger.dbg("SEND EMAIL TO USER 'POST' - Sending email to: " + user.mail);
        const result = await sendUserMail(user);
        if (result) {
          res.sendStatus(200);
        } else {
          res.sendStatus(500);
        }
      } else {
        res.status(404).send("Participant not found!");
      }

    } catch (e) {
      Logger.monitorLog("ERROR - SEND EMAIL TO USER 'POST' - " + e);
      res.sendStatus(500);
    }
  } else {
    res.sendStatus(401);
  }
});

async function sendUserMail(user) {
  var result;
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
    if (err) {
      Logger.dbg("SENDUSERMAIL FUNCTION - Error verifying transporter: " + err);
      result = false;
    }
    else Logger.dbg('SENDUSERMAIL FUNCTION - Your config is correct');
  });

  await transporter.sendMail({
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
    Logger.dbg("SENDUSERMAIL FUNCTION - Message sent: " + info.messageId + " to " + user.mail);
    transporter.close();
    result = true;
  }).catch((error) => {
    Logger.dbg("ERROR - SENDUSERMAILFUNCTION - Error sending mail: " + error);
    result = false;
  });
  return result;
};

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
