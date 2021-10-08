require("dotenv").config();

const Logger = require("./logger.js");
const Session = require("./models/Session.js");
const User = require("./models/User.js");
const Room = require("./models/Room.js");
const Test = require("./models/Test.js");

let uids = new Map();
let rooms = new Map();
let sessions = new Map();
let tokens = new Map();
let connectedUsers = new Map();
let userToSocketID = new Map();
let lastSessionEvent = new Map();


//A function to parse an entrance into a json
function toJSON(obj) {
  return JSON.stringify(obj, null, 2);
}


//A simple wait function to wait a specified period of ms
async function wait(ms) {
  await setTimeout(() => { }, ms);
}


//A function to test if user has finished or to bring him/her a new exercise
async function exerciseTimeUp(id, description) {
  console.log("Friend ", id, " is out of time!");
  const user = await User.findOne({
    socketId: id,
    environment: process.env.NODE_ENV,
  });
  if (user) {
    const room = await Room.findOne({
      session: user.subject,
      name: user.room.toString(),
      environment: process.env.NODE_ENV,
    });
    if (room) {
      const test = await Test.findOne({
        orderNumber: room.currentTest,
        environment: process.env.NODE_ENV,
        session: user.subject,
      });

      //Until here, the function looks for an user, coinciding with id. Looks for his/her room and the test in which he/she is
      const exercise = test.exercises[room.lastExercise];

      //Tries a new exercise, if there's no more on the test, tries a new test
      if (exercise) {
        //If there is 1 more exercise on the test, user picks it
        if (test.exercises[room.lastExercise + 1]) {
          console.log("They are going to the next exercise");
          room.lastExercise += 1;
          await room.save();
        } else { //if not, picks another test
          const nextTest = await Test.findOne({
            orderNumber: room.currentTest + 1,
            environment: process.env.NODE_ENV,
            session: user.subject,
          });
          //If there is a new test, it starts in the first exercise 
          if (nextTest) {
            console.log("They got a new test (Prueba)");
            room.lastExercise = 0;
            room.test += 1;
            await room.save();
          } else { //If there isn't, it indicates the room has finished
            console.log("They finished");
            room.finished = true;
            await room.save();
          }
        }
      }
    }
  }
}



async function executeSession(sessionName, io) {

  lastSessionEvent.set(sessionName, []);
  Logger.dbg("executeSession - Cleared last event of session " + sessionName);

  Logger.dbg("executeSession - Starting " + sessionName);
  const session = await Session.findOne({
    name: sessionName,
    environment: process.env.NODE_ENV,
  });

  session.running = true;
  session.save();
  Logger.dbg("executeSession - Running ", session, ["name", "pairingMode", "tokenPairing", "blindParticipant"]);

  const tests = await Test.find({
    session: session.name,
    environment: process.env.NODE_ENV,
  }).sort({ orderNumber: 1 });

  const numTests = tests.length;

  let timer = 0;
  let maxExercises = tests[session.testCounter].exercises.length;

  Logger.dbg("executeSession - testCounter: " + session.testCounter + " of " + numTests + " , exerciseCounter: " + session.exerciseCounter + " of " + maxExercises);

  var event = ["loadTest", {
    data: {
      testDescription: tests[0].description,
      peerChange: tests[0].peerChange,
    }
  }];

  io.to(sessionName).emit(event[0], event[1]);

  lastSessionEvent.set(sessionName, event);
  Logger.dbg("executeSession - lastSessionEvent saved", event[0]);

  const interval = setInterval(function () {

    if (session.testCounter == numTests) {
      console.log("There are no more tests, the session <" + session.name + "> has finish!");
      Logger.dbg("executeSession - emitting 'finish' event in session " + session.name + " #############################");

      io.to(sessionName).emit("finish");
      lastSessionEvent.set(sessionName, ["finish"]);
      Logger.dbg("executeSession - lastSessionEvent saved", event);

      clearInterval(interval);
    } else if (timer > 0) {
      io.to(sessionName).emit("countDown", {
        data: timer,
      });
      console.log(timer);
      timer--;
    } else if (session.exerciseCounter == maxExercises) {
      console.log("Going to the next test!");
      session.testCounter++;
      session.exerciseCounter = -1;
    } else if (session.exerciseCounter === -1) {
      console.log("Loading test");

      var event = ["loadTest", {
        data: {
          testDescription: tests[session.testCounter].description,
          peerChange: tests[session.testCounter].peerChange,
        },
      }];
      io.to(sessionName).emit(event[0], event[1]);

      lastSessionEvent.set(sessionName, event);
      Logger.dbg("executeSession - lastSessionEvent saved", event[0]);


      timer = tests[session.testCounter].time;
      session.exerciseCounter = 0;
      Logger.dbg("executeSession - testCounter: " + session.testCounter + " of " + numTests + " , exerciseCounter: " + session.exerciseCounter + " of " + maxExercises);

    } else {
      console.log("Starting new exercise:");
      let testLanguage = tests[session.testCounter].language;
      let exercise =
        tests[session.testCounter].exercises[session.exerciseCounter];
      if (exercise) {
        console.log("   " + exercise.description.substring(0, Math.min(80, exercise.description.length)) + "...");

        var event = ["newExercise", {
          data: {
            maxTime: exercise.time,
            exerciseDescription: exercise.description,
            exerciseType: exercise.type,
            inputs: exercise.inputs,
            solutions: exercise.solutions,
            testLanguage: testLanguage,
          },
        }];
        io.to(sessionName).emit(event[0], event[1]);
        lastSessionEvent.set(sessionName, event);
        Logger.dbg("executeSession - lastSessionEvent saved", event[0]);

        sessions.set(session.name, {
          session: session,
          exerciseType: exercise.type,
        });
        timer = exercise.time;
      }
      session.exerciseCounter++;
      Logger.dbg(" testCounter: " + session.testCounter + " of " + numTests + " , exerciseCounter: " + session.exerciseCounter + " of " + maxExercises);

      session.save();
      Logger.dbg("executeSession - session saved ");
    }


    Session.findOne({
      name: sessionName,
      environment: process.env.NODE_ENV,
    }).then((currentSession) => {
      if (!currentSession.running) {
        clearInterval(interval);
        Logger.dbg("executeSession - clearInterval");
      }
    });
  }, 1000);
}



async function notifyParticipants(sessionName, io) {
  const potentialParticipants = await User.find({
    environment: process.env.NODE_ENV,
    subject: sessionName,
  })

  var participants = [];
  Logger.dbg("notifyParticipants - Number of potential participants: " + potentialParticipants.length);
  potentialParticipants.forEach((p) => {
    //Filter out the one not connected : they don't have the property socketId! 
    if (p.socketId) {
      Logger.dbg("notifyParticipants - Including connected participant", p.mail);
      participants.push(p);
    } else {
      Logger.dbg("notifyParticipants - Skipping NOT CONNECTED participant", p.mail);
    }
  });

  if (participants.length < 2) {
    Logger.dbg("notifyParticipants - UNEXPECTED ERROR - THERE ARE NOT CONNECTED PARTICIPANTS:" + JSON.stringify(potentialParticipants, null, 2));
    return;
  }

  const session = await Session.findOne({
    name: sessionName,
    environment: process.env.NODE_ENV,
  });

  var excluded = { code: "XXXX" };


  Logger.dbg("notifyParticipants - MANUAL pairing");

  var participantCount = participants.length;
  var roomCount = Math.floor(participantCount / 2);


  if ((participantCount % 2) == 0)
    Logger.dbg("notifyParticipants - the participant count is even, PERFECT PAIRING! :-)");
  else {
    excluded = participants[participantCount - 1];
    Logger.dbg("notifyParticipants - the participant count is odd: IMPERFECT PAIRING :-(");
    Logger.dbg("   -> One participant will be excluded: ", excluded, ["code", "mail"]);
  }

  var initialRoom = 100;

  Logger.dbg("notifyParticipants - Re-assigning rooms to avoid race conditions!");

  var nonMaleList = []
  var maleList = []
  for (j = 0; j < participants.length; j++) {
    if (participants[j].gender == "Male") {
      maleList[maleList.length] = participants[j];
    }
    else {
      nonMaleList[nonMaleList.length] = participants[j];
    }
  }

  l = nonMaleList.concat(maleList);

  console.log(l);


  var controlList = [];
  var expertimentList = [];

  for (ui = 0; ui < l.length; ui++) {
    if (ui % 2 == 0) expertimentList[expertimentList.length] = l[ui];
    else controlList[controlList.length] = l[ui];
  }

  console.log(controlList);
  console.log(expertimentList);

  console.log(controlList + "\n" + expertimentList);
  participantNumber = 0;

  for (i = 0; i < roomCount; i++) {
    let peer1 = controlList[i];
    let peer2 = expertimentList[i];

    console.log("\n\n\n\n\n\n\n\n\n\n\nPEER\n\n\n\n\n\n\n\n");
    console.log(peer1);
    console.log("\n\n\n\n\n\n\n\n\n\n");
    console.log(peer2);
    console.log("\n\n\n\n\n\n\n\n\n\n");


    peer1.room = i + initialRoom;
    peer2.room = i + initialRoom;

    if (i % 2 == 0) {
      peer1.blind = session.blindParticipant;
      peer2.blind = false;
    }
    else {
      peer1.blind = false;
      peer2.blind = session.blindParticipant;
    }
    Logger.dbg("notifyParticipants - Pair created in room <" + peer1.room + ">:\n" +
      "    -" + peer1.code + ", " + peer1.firstName + ", " + peer1.firstName + ", " + peer1.gender + ", " + peer1.blind + "\n" +
      "    -" + peer2.code + ", " + peer2.firstName + ", " + peer2.firstName + ", " + peer2.gender + ", " + peer2.blind);
  }



  participants.forEach((p) => {
    Logger.dbg("notifyParticipants - connected participants: ", p, ["code", "mail", "room", "blind"]);
  });

  connectedUsers = new Map();

  Logger.dbg("notifyParticipants - connectedUsers cleared", connectedUsers);


  for (const participant of participants) {

    /** VERBOSE DEBUG ******************************************************************
    Logger.dbg("notifyParticipants - excluded: ",excluded,["code"]);
    Logger.dbg("notifyParticipants - participant: ",participant,["code"]);
    Logger.dbg("notifyParticipants - (<"+excluded.code+"> == <"+participant.code+">)?");
    ************************************************************************************/

    if (excluded.code != participant.code) {

      myRoom = participant.room;
      myCode = participant.code;
      myBlind = participant.blind;

      var user = await User.findOne({
        subject: sessionName,
        environment: process.env.NODE_ENV,
        code: myCode
      });

      if (!user) {
        Logger.dbg("notifyParticipants - UNEXPECTED ERROR - USER NOT FOUND for " + myCode + " in DB");
        return;
      }

      user.blind = myBlind;
      user.room = myRoom;

      Logger.dbg("notifyParticipants - Saving user", user, ["code", "firstName", "gender", "room", "blind"]);
      user.save();

      Logger.dbg("notifyParticipants - Saving room in DB for " + myCode, user.room);

      // DBG-VERBOSE: Logger.dbg("notifyParticipants - Searching pair of "+myCode+" in room"+myRoom);  


      const pair = participants.filter((p) => {
        return (p.room == myRoom) && (p.code != myCode);
      })[0];

      connectedUsers.set(myCode, pair.code);

      if (!pair) {
        Logger.dbg("notifyParticipants - UNEXPECTED ERROR - PAIR NOT FOUND for " + myCode + " in room");
        return;
      }

      Logger.dbg("notifyParticipants - Found pair of " + myCode + " in room" + myRoom, pair, ["code", "mail"]);

      var newGender = Math.random() > 0.5 ? "Female" : "Male"; // If number greater than 0.5, gender = , else gender = Male
      Logger.dbg("notifyParticipants - Session <" + sessionName + "> - Emitting 'sessionStart' event to <" + participant.code + "> in room <" + sessionName + participant.room + ">");
      io.to(participant.socketId).emit("sessionStart", {
        room: sessionName + participant.room,
        user: {
          code: participant.code,
          blind: participant.blind,
        },
        pairedTo: newGender,
      });

    } else {
      Logger.dbg("notifyParticipants - Session <" + sessionName + "> - Excluding  <" + participant.code + "> from the 'sessionStart' event");
    }

  }
  Logger.dbg("notifyParticipants - connectedUsers after notification", connectedUsers);

}



module.exports = {
  startSession: function (sessionName, io) {

    Logger.dbg("startSession " + sessionName);

    notifyParticipants(sessionName, io);

    setTimeout(() => {
      executeSession(sessionName, io);
    }, 5000);
  },
  start: function (io) {
    function connection(socket) {
      Logger.dbg("NEW CONNECTION " + socket.id);

      Logger.log(
        "NewConn",
        socket.id,
        "New user with socket id " + socket.id + " has entered"
      );

      socket.on("adminConnected", (session) => {
        Logger.dbg("EVENT adminConnected", session);
        console.log("Admin watching " + session);
        socket.join(session);
      });

      socket.on("clientConnected", async (pack) => {
        Logger.dbg("EVENT clientConnected", pack);

        const user = await User.findOne({
          code: pack,
          environment: process.env.NODE_ENV,
        });
        if (user) {
          io.to(user.subject).emit("clientConnected", user.code);
        }
      });

      socket.on("requestToJoinAgain", (pack) => {
        console.log("Asking " + pack + " to rejoin.");
        io.to(pack).emit("clientJoinAgain");
      });

      socket.on("clientReady", async (pack) => {
        Logger.dbg("EVENT clientReady", pack);

        const user = await User.findOne({
          code: pack,
          environment: process.env.NODE_ENV,
        });


        Logger.dbg("EVENT clientReady - User Retrival [" + pack + "] - ", user, ["code", "mail"]);

        const session = await Session.findOne({
          name: user.subject,
          environment: process.env.NODE_ENV,
        });
        if (session && session.active) {
          userToSocketID.set(user.code, socket.id);
          user.socketId = socket.id; // TODO: Will be placed outside this function at some point
          Logger.dbg("EVENT clientReady - Saving user", user, ["code", "firstName", "gender", "room", "blind"]);
          await user.save();

          Logger.dbg("EVENT clientReady ------- Starting " + session.pairingMode + " pairing in session <" + session.name + "> for User " + user.code + "------------------------------");

          let lastUserJoined = await User.find({
            subject: session.name,
            environment: process.env.NODE_ENV,
            room: { $exists: true },
          }).sort("-room");

          Logger.dbg("EVENT clientReady - MANUAL Pairing [" + pack + "] - Last User: ", lastUserJoined[lastUserJoined.length - 1], ["code"]);
          Logger.dbg("EVENT clientReady - lastUserJoined Length:", lastUserJoined.length);

          if (lastUserJoined.length != 0) {
            let lastUserPairJoined = await User.find({
              subject: session.name,
              environment: process.env.NODE_ENV,
              room: lastUserJoined[0].room,
            });

            Logger.dbg("EVENT clientReady - lastUserPairJoined Length: ", lastUserPairJoined.length);

            if (lastUserPairJoined.length < 2) {
              user.room = lastUserPairJoined[0].room;

              Logger.dbg("EVENT clientReady - Peer Assigned: ", lastUserPairJoined[0], ["code", "mail"]);
              Logger.dbg("EVENT clientReady - Room Assigned: " + user.room);

              connectedUsers.set(user.code, lastUserPairJoined[0].code);
              connectedUsers.set(lastUserPairJoined[0].code, user.code);

              Logger.dbg("EVENT clientReady - connectedUsers: ", connectedUsers);


              if (session.blindParticipant) {
                user.blind = true;
              }
            } else {
              user.room = lastUserPairJoined[0].room + 1;
              Logger.dbg("EVENT clientReady - Room Assigned: " + user.room);
            }
          } else {
            user.room = 0;
            Logger.dbg("EVENT clientReady - First PEER - Assigned Room 0 ");
          }
          Logger.dbg("EVENT clientReady - FINISH - Saving user", user, ["code", "firstName", "gender", "room", "blind"]);
          user.save();

        }
      });

      socket.on("clientReconnection", async (pack) => {
        Logger.dbg("EVENT clientReconnection ", pack);
        const user = await User.findOne({
          code: pack,
          environment: process.env.NODE_ENV,
        });
        if (user) {
          Logger.dbg("EVENT clientReconnection - user found", user, ["code", "socketId"]);

          userToSocketID.set(user.code, socket.id);
          user.socketId = socket.id;
          socket.join(user.subject);

          Logger.dbg("EVENT clientReconnection - Saving user", user, ["code", "firstName", "gender", "room", "blind"]);
          await user.save();

          Logger.dbg("EVENT clientReconnection - socketId updated", user, ["code", "socketId"]);

          // RECOVER LAST EVENT OF USER SESSION
          let lastEvent = lastSessionEvent.get(user.subject);

          if (lastEvent && lastEvent.length) {
            Logger.dbg("EVENT clientReconnection - Last Recovered Event", lastEvent[0]);
            if (lastEvent.length == 1) {
              Logger.dbg("EVENT clientReconnection - Submitted last event without data", lastEvent[0]);
              io.to(socket.id).emit(lastEvent[0]);
            } else {
              Logger.dbg("EVENT clientReconnection - Submitted last event with data", lastEvent[0]);

              // SEND LAST EVENT OF THE SESSION TO RECONNECTED USER
              io.to(socket.id).emit(lastEvent[0], lastEvent[1]);

              if (lastEvent[0] == "newExercise" && lastEvent[1]) {
                Logger.dbg("EVENT clientReconnection - Session in the middle of an exercise.");

                if (lastEvent[1].data && lastEvent[1].data.exerciseType == "PAIR") {
                  Logger.dbg("EVENT clientReconnection - Session in the middle of an exercise to be done in PAIRs...");

                  // FIND PEER SOCKET 
                  const peer = await User.findOne({
                    room: user.room,
                    subject: user.subject,
                    environment: process.env.NODE_ENV,
                    code: { $ne: user.code }
                  });

                  if (peer) {
                    Logger.dbg("EVENT clientReconnection - Peer found for " + user.code, peer, ["code"]);
                    io.to(peer.socketId).emit("requestBulkCodeEvent", user.socketId);
                    Logger.dbg("EVENT clientReconnection - Submitted requestBulkCodeEvent to peer", peer, ["code", "socketId"]);
                  } else {
                    Logger.dbg("EVENT clientReconnection - PEER NOT FOUND with query ", {
                      room: user.room,
                      subject: user.subject,
                      environment: process.env.NODE_ENV,
                      code: { $ne: user.code }
                    });
                  }


                }
              } else {
                Logger.dbg("EVENT clientReconnection - Last event wasn't an exercise", lastEvent[0]);
              }


            }
          } else {
            Logger.dbg("EVENT clientReconnection : LAST EVENT NOT FOUND for session " + user.subject, lastEvent);
          }

        } else {
          Logger.dbg("EVENT clientReconnection : USER NOT FOUND", pack);
        }
        tokens.set(pack, user.subject);

      });

      socket.on("bulkCode", async (pack) => {
        Logger.dbg("EVENT bulkCode ", pack);
        io.to(pack.data.peerSocketId).emit("bulkCodeUpdate", pack.data.code);
        Logger.dbg("EVENT clientReconnection - Submitted bulkCodeUpdate to peer " + pack.data.peerSocketId, pack.data.code);
      });

      socket.on("cursorActivity", (data) => {
        // Too expensive dbg:
        // Logger.dbg("EVENT cursorActivity");
        io.to(connectedUsers.get(socket.id)).emit("cursorActivity", data);
      });

      socket.on("updateCode", (pack) => {

        // Too expensive dbg:
        // Logger.dbg("EVENT updateCode",pack);

        const sessionInMemory = sessions.get(tokens.get(pack.token));
        if (sessionInMemory != null) {
          if (sessions.get(tokens.get(pack.token)).exerciseType == "PAIR") {
            // Too expensive dbg:
            //    Logger.dbg("EVENT updateCode --> " + userToSocketID.get(connectedUsers.get(pack.token)));
            io.to(userToSocketID.get(connectedUsers.get(pack.token))).emit(
              "refreshCode",
              pack.data
            );
          }
          lastText = pack.data;
          var uid = uids.get(socket.id);
          Logger.log(
            "Code",
            pack.token,
            pack.data,
            sessions.get(tokens.get(pack.token)).session.exerciseCounter,
            sessions.get(tokens.get(pack.token)).session.testCounter
          );
        }
      });

      socket.on("msg", (pack) => {

        Logger.dbg("EVENT msg", pack);

        if (sessions.get(tokens.get(pack.token)) == null) {
          Logger.dbg("EVENT msg - MESSAGE SENT when exercise hasn't started!!!: Ignored ", pack.token);
          Logger.dbg("EVENT msg - tokens ", tokens);
          Logger.dbg("EVENT msg - tokens.get(pack.token) ", tokens.get(pack.token));
          return;
        }


        if (sessions.get(tokens.get(pack.token)).exerciseType == "PAIR") {
          io.sockets.emit("msg", pack);
        }
        var uid = uids.get(socket.id);
        Logger.log(
          "Chat",
          pack.token,
          pack.data,
          sessions.get(tokens.get(pack.token)).session.exerciseCounter,
          sessions.get(tokens.get(pack.token)).session.testCounter
        );
      });

      socket.on("giveControl", (pack) => {
        Logger.dbg("EVENT giveControl", pack);
        io.sockets.emit("giveControl", pack);
        var uid = uids.get(socket.id);
        Logger.log(
          "giveControl",
          pack.token,
          "New giveControl event by " +
          socket.id +
          "(" +
          uid +
          ") in room <" +
          pack.rid +
          ">:" +
          toJSON(pack)
        );
      });

      socket.on("registry", async (pack) => {
        Logger.dbg("EVENT registry", pack);
        console.log("Registry event for: " + socket.id + "," + pack.uid);

        uids.set(socket.id, pack.uid);

        var room = new Object();

        if (rooms.has(pack.rid)) {
          Logger.log(
            "Registry",
            pack.token,
            "Entering room " +
            socket.id +
            ": with <" +
            pack.uid +
            ">  of room <" +
            pack.rid +
            ">: " +
            pack.data
          );
          room = rooms.get(pack.rid);
          io.sockets.emit("giveControl", {
            uid: pack.uid,
            rid: pack.rid,
            sid: socket.id,
            data: "",
          });
        } else {
          Logger.log(
            "Registry",
            pack.token,
            "Registering " +
            socket.id +
            ": with <" +
            pack.uid +
            ">  of room <" +
            pack.rid +
            ">: " +
            pack.data
          );
          room.users = new Array();
          room.lastText = "";
        }

        room.users.push({
          uid: pack.uid,
          sid: socket.id,
        });

        const user = await User.findOne({
          socketId: socket.id,
          environment: process.env.NODE_ENV,
        });

        console.log("###################################################");
        console.log("User to enter in room: " + JSON.stringify(user, null, 2));

        room.session = rooms.set(pack.rid, room);

        Logger.log(
          "Registry",
          pack.token,
          "Updated room saved:" + toJSON(room)
        );

        socket.emit("userRegistered", {
          uid: pack.uid,
          rid: pack.rid,
          sid: socket.id,
          data: room.lastText,
        });
      });

      socket.on("nextExercise", async (pack) => {

        io.sockets.emit("nextExercise", {
          uid: pack.uid,
          rid: pack.rid,
          sid: socket.id,
          data: pack.data,
        });
        if (!pack.data.gotRight) {
          await exerciseTimeUp(socket.id, pack.data);
        }
      });

      socket.on("clientFinished", async (data) => {
        Logger.dbg("EVENT clientFinished", data);
      });

      socket.on("startDebugSession", async (pack) => {
        if (process.env.NODE_ENV === "local") await executeSession("TFM", io);
      });

      socket.on("disconnect", async () => {
        const user = await User.findOne({
          socketId: socket.id,
          environment: process.env.NODE_ENV,
        });
        if (user) {
          io.to(user.subject).emit("clientDisconnected", user.code);
        }
      });
      // In case of a failure in the connection.
      io.to(socket.id).emit("reconnect");
    }

    io.on("connection", connection);
  },
};
