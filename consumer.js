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

function toJSON(obj) {
  return JSON.stringify(obj, null, 2);
}

async function wait(ms) {
  await setTimeout(() => {}, ms);
}

async function pairing(session, io) {
  console.log("Starting the pairing of", session.name);
  let usersWaitingForRoom = await User.find({
    subject: session.name,
    token: { $exists: true },
    room: { $exists: false },
    environment: process.env.NODE_ENV,
  });

  for (const userTaken of usersWaitingForRoom) {
    const numberOfMaxRoomArray = await User.aggregate([
      {
        $match: {
          subject: session.name,
          environment: process.env.NODE_ENV,
        },
      },
      { $group: { _id: null, max: { $max: "$room" } } },
    ]);

    // Number of the last room that was assigned
    const numberOfMaxRoom = numberOfMaxRoomArray[0];

    // Update the user (Workaround)
    const user = await User.findById(userTaken.id);

    // If the user is not assigned to a room yet
    if (typeof user.room === "undefined") {
      // Take a user to pair with
      const pairedUser = await User.findOne({
        subject: session.name,
        gender: { $nin: [user.gender] },
        token: session.tokenPairing
          ? { $nin: [user.token], $exists: true }
          : { $exists: true },
        room: { $exists: false },
        environment: process.env.NODE_ENV,
      });

      if (pairedUser) {
        console.log("We found a great user to pair with!");
        if (numberOfMaxRoom.max != null) {
          user.room = numberOfMaxRoom.max + 1;
          pairedUser.room = numberOfMaxRoom.max + 1;
        } else {
          user.room = 0;
          pairedUser.room = 0;
        }
        await user.save();
        await pairedUser.save();

        io.to(user.socketId).emit("sessionStart", {
          room: session.name + user.room,
        });
        io.to(pairedUser.socketId).emit("sessionStart", {
          room: session.name + pairedUser.room,
        });

        connectedUsers.set(user.code, pairedUser.code);
        connectedUsers.set(pairedUser.code, user.code);
      } else {
        const anyOtherUser = await User.findOne({
          subject: session.name,
          code: { $nin: [user.code] },
          token: session.tokenPairing
            ? { $nin: [user.token], $exists: true }
            : { $exists: true },
          room: { $exists: false },
          environment: process.env.NODE_ENV,
        });

        if (anyOtherUser) {
          if (numberOfMaxRoom.max != null) {
            user.room = numberOfMaxRoom.max + 1;
            anyOtherUser.room = numberOfMaxRoom.max + 1;
          } else {
            user.room = 0;
            anyOtherUser.room = 0;
          }
          await user.save();
          await anyOtherUser.save();
          connectedUsers.set(user.code, anyOtherUser.code);
          connectedUsers.set(anyOtherUser.code, user.code);

          io.to(user.socketId).emit("sessionStart", {
            room: session.name + user.room,
          });
          io.to(anyOtherUser.socketId).emit("sessionStart", {
            room: session.name + anyOtherUser.room,
          });
        } else {
          if (numberOfMaxRoom.max !== null) {
            user.room = numberOfMaxRoom.max + 1;
          } else {
            user.room = 0;
          }

          await user.save();
          io.to(user.socketId).emit("sessionStart", {
            room: session.name + user.room,
          });
          console.log(
            "User " + user.socketId + " is paired alone in room " + user.room
          );
        }
      }
    }
  }

  console.log("Pairing done!");
  setTimeout(function () {
    executeSession(session.name, io);
  }, 5000);
}

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

      const exercise = test.exercises[room.lastExercise];

      if (exercise) {
        if (test.exercises[room.lastExercise + 1]) {
          console.log("They are going to the next exercise");
          room.lastExercise += 1;
          await room.save();
        } else {
          const nextTest = await Test.findOne({
            orderNumber: room.currentTest + 1,
            environment: process.env.NODE_ENV,
            session: user.subject,
          });
          if (nextTest) {
            console.log("They got a new test (Prueba)");
            room.lastExercise = 0;
            room.test += 1;
            await room.save();
          } else {
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
  console.log("Starting session...");
  const session = await Session.findOne({
    name: sessionName,
    environment: process.env.NODE_ENV,
  });

  session.running = true;
  session.save();

  const tests = await Test.find({
    session: session.name,
    environment: process.env.NODE_ENV,
  }).sort({ orderNumber: 1 });

  const numTests = tests.length;

  let timer = 0;
  let maxExercises = tests[session.testCounter].exercises.length;
  io.to(sessionName).emit("loadTest", {
    data: {
      testDescription: tests[0].description,
      peerChange: tests[0].peerChange,
    },
  });
  const interval = setInterval(function () {
    if (session.testCounter == numTests) {
      console.log("Oh there are no more tests, you finished!");
      io.to(sessionName).emit("finish");
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
      io.to(sessionName).emit("loadTest", {
        data: {
          testDescription: tests[session.testCounter].description,
          peerChange: tests[session.testCounter].peerChange,
        },
      });
      timer = tests[session.testCounter].time;
      session.exerciseCounter = 0;
    } else {
      console.log("Starting new exercise!");
      let exercise =
        tests[session.testCounter].exercises[session.exerciseCounter];
      if (exercise) {
        console.log(exercise.description);
        io.to(sessionName).emit("newExercise", {
          data: {
            maxTime: exercise.time,
            exerciseDescription: exercise.description,
            exerciseType: exercise.type,
          },
        });
        sessions.set(session.name, {
          session: session,
          exerciseType: exercise.type,
        });
        timer = exercise.time;
      }
      session.exerciseCounter++;
      session.save();
    }

    Session.findOne({
      name: sessionName,
      environment: process.env.NODE_ENV,
    }).then((currentSession) => {
      if (!currentSession.running) {
        clearInterval(interval);
      }
    });
  }, 1000);
}

module.exports = {
  start: function (io) {
    function connection(socket) {
      Logger.log(
        "NewConn",
        socket.id,
        "New user with id " + socket.id + " has entered"
      );

      socket.on("clientReady", async (pack) => {
        const user = await User.findOne({
          code: pack,
          environment: process.env.NODE_ENV,
        });
        const session = await Session.findOne({
          name: user.subject,
          environment: process.env.NODE_ENV,
        });
        console.log(session);
        if (session && session.active) {
          userToSocketID.set(user.code, socket.id);
          user.socketId = socket.id; // TODO: Will be placed outside this function at some point
          await user.save();

          Logger.log(
            "NewConn",
            user.code,
            "Client " + user.code + " is ready!"
          );

          let usersCountSupposedToConnectNotReady = await User.countDocuments({
            subject: session.name,
            token: { $exists: false },
            room: { $exists: false },
            environment: process.env.NODE_ENV,
          });
          console.log(
            "Faltan " + usersCountSupposedToConnectNotReady + " usuarios..."
          );
          if (usersCountSupposedToConnectNotReady == 0) {
            console.log("Pairing...");
            await pairing(session, io);
          }
        }
      });

      socket.on("clientReconnection", async (pack) => {
        const user = await User.findOne({
          code: pack,
          environment: process.env.NODE_ENV,
        });
        if (user) {
          userToSocketID.set(user.code, socket.id);
          user.socketId = socket.id;
          console.log("Reconnecting in session " + user.subject);
          socket.join(user.subject);
          await user.save();
        }
        tokens.set(pack, user.subject);
      });

      socket.on("cursorActivity", (data) => {
        io.to(connectedUsers.get(socket.id)).emit("cursorActivity", data);
      });

      socket.on("updateCode", (pack) => {
        if (sessions.get(tokens.get(pack.token)).exerciseType == "PAIR") {
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
      });

      socket.on("msg", (pack) => {
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

      socket.on("registry", (pack) => {
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

      socket.on("startDebugSession", async (pack) => {
        if (process.env.NODE_ENV === "local") await executeSession("TFM", io);
      });

      // In case of a failure in the connection.
      io.to(socket.id).emit("reconnect");
    }

    io.on("connection", connection);
  },
};
