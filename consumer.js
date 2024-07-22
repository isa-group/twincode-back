require("dotenv").config();
const Logger = require("./logger.js");
const Session = require("./models/Session.js");
const User = require("./models/User.js");
const Room = require("./models/Room.js");
const Test = require("./models/Test.js");
const { dbg } = require("./logger.js");
const { get } = require("mongoose");
const axios = require("axios");

let uids = new Map();
let rooms = new Map();
let sessions = new Map();
let tokens = new Map();
let connectedUsers = new Map();
let userToSocketID = new Map();
let lastSessionEvent = new Map();
let threadforUser = new Map();

//A function to parse an entrance into a json
function toJSON(obj) {
  return JSON.stringify(obj, null, 2);
}

async function sendMsgToLeia(pack, subject, room, io) {

    url = process.env.LEIA_API_URL + `/api/v1/session/${subject}/room/${room}`;
    Logger.dbg("Send Message To LEIA - URL <" + url + ">");
    
    axios.post(url, {
    eventType: "message",
    eventContent: {
        code: pack.data.code,
        message: pack.data.message,
        question: pack.data.exercise
    }
    }, {
    headers: {
        "Content-Type": "application/json",
    }
    })
    .then((response) => {
      Logger.dbg("Response from LEIA - " + response.data);
      if(response.data.message) {
          pack.data = response.data.message;
          waitTime = response.data.message.length * 150;
          pack.uid = "LEIA";
          setTimeout(() => {
            io.sockets.emit("msg", pack);
          }, waitTime);
      }
      if(response.data.code) {
          pack.code = response.data.code;
          pack.uid = "LEIA";
          io.sockets.emit("leiaCode", pack);
      }
    })
    .catch((error) => {
    Logger.dbgerr("Send Message To LEIA - ERROR <" + error + ">");
    });
}

//A simple wait function to wait a specified period of ms
async function wait(ms) {
  await setTimeout(() => { }, ms);
}

function randomNumber(min, max) {
  return Math.floor(Math.random() * (max - min));
}

// Fisher yates-shuffle to randomize an array --> https://en.wikipedia.org/wiki/Fisher%E2%80%93Yates_shuffle
function shuffleArray(array) {
  let i = array.length;
  while (i--) {
    const ri = Math.floor(Math.random() * i);
    [array[i], array[ri]] = [array[ri], array[i]];
  }
  return array;
}

//A function to test if user has finished or to bring him/her a new exercise
async function exerciseTimeUp(id, description) {
  Logger.dbg("Friend " + id + " is out of time!");
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
          Logger.dbg("They are going to the next exercise");
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
            Logger.dbg("They got a new test (Prueba)");
            room.lastExercise = 0;
            room.test += 1;
            await room.save();
          } else { //If there isn't, it indicates the room has finished
            Logger.dbg("They finished");
            room.finished = true;
            await room.save();
          }
        }
      }
    }
  }
}

function  getNextExerciseNumber(participant, listExercises) {
  Logger.dbg(`getExercise - ${participant.code} - Init - for code ${participant.code}`);
  
  var num2Send = null;

  if (listExercises[0].type == "PAIR") {
  
    Logger.dbg(`getExercise - ${participant.code} - <${listExercises[0].type}> exercise`);
    
    num2Send = participant.visitedPExercises.length;

    Logger.dbg(`getExercise - ${participant.code} - num2send = <${num2Send}> DEFAULT`);

    if (!participant.exerciseSwitch) {
      Logger.dbg(`getExercise - ${participant.code} - switch for ${participant.code} is <${participant.exerciseSwitch}>`);
      num2Send += listExercises.length / 2;
      Logger.dbg(`getExercise - ${participant.code} - num2send = <${num2Send}> UPDATE `);
    }

    if (num2Send >= listExercises.length) {
      Logger.dbg(`getExercise - ${participant.code} - num2send Overflow (${num2Send} >= ${listExercises.length}) (no more available exercises) `);
      num2Send -= 1;
      Logger.dbg(`getExercise - ${participant.code} - num2send = <${num2Send}> UPDATE `);
    }


  } else {
    
    Logger.dbg(`getExercise - ${participant.code} - <${listExercises[0].type}> exercise`);
        
    num2Send = randomNumber(0, listExercises.length);

    Logger.dbg(`getExercise - ${participant.code} - num2send = <${num2Send}> DEFAULT (random between 0 and ${listExercises.length})`);

    if (participant.visitedIExercises.length < listExercises.length) {
      Logger.dbg(`getExercise - ${participant.code} - (${participant.visitedIExercises.length} < ${listExercises.length}) (there are available exercises) `);

      while(participant.visitedIExercises.includes(num2Send)) {
        Logger.dbg(`getExercise - ${participant.code} - num2send already visited`);
        num2Send = randomNumber(0, listExercises.length);
        Logger.dbg(`getExercise - ${participant.code} - num2send = <${num2Send}> UPDATED (random between 0 and ${listExercises.length})`);
      }
    }
    
  }
  
  Logger.dbg(`getExercise - ${participant.code} - num2send = <${num2Send}> FINAL `);
  return num2Send;
}

async function executeStandardSession(session, io) {
  if (!session) { 
    Logger.dbg("ExecuteStandardSession - Session not found");
    return;
  }
  var sessionName = session.name;

  session.running = true;
  session.save(); //Saves it on database
  Logger.dbg("executeStandardSession - Running ", session, ["name", "pairingMode", "tokenPairing", "blindParticipant"]);
  
  //Pick all tests
  const tests = await Test.find({
    session: session.name,
    environment: process.env.NODE_ENV,
  }).sort({ orderNumber: 1 });
  
  if (tests.length == 0) {
    Logger.dbg("executeStandardSession - No tests found");
    return;
  }
  Logger.dbg("executeStandardSession - tests found", tests);
  //Number of tests in a session
  const numTests = tests.length;
  
  //testCounter = session attribute that shows the order of the tests (actual test)
  let timer = 0;
  let maxExercises = tests[session.testCounter].exercises.length;

  Logger.dbg("executeStandardSession - testCounter: " + session.testCounter + " of " + numTests + " , exerciseCounter: " + session.exerciseCounter + " of " + maxExercises);
  
  //Here it is loaded the test
  var event = ["loadTest", {
    data: {
      testDescription: tests[0].description,
      peerChange: tests[0].peerChange,
      isStandard: session.isStandard,
      testCounterS: session.testCounter
    }
  }];

  try {
    Logger.dbg("executeStandardSession - Sending loadTest event");
    io.to(sessionName).emit(event[0], event[1]);
  } catch (err) {
    Logger.dbg(`executeStandardSession - error found at executing session: ${err}`);
  }

  lastSessionEvent.set(sessionName, event);
  Logger.dbg("executeStandardSession - lastSessionEvent saved", event[0])  
  
  
  const potentialParticipants = await User.find({ //It picks all the registered users in the session
    environment: process.env.NODE_ENV,
    subject: sessionName,
  });

  if (!potentialParticipants) {
    Logger.dbg("executeStandardSession - No participants found");
    return;
  }

  try {
    Logger.dbg("executeStandardSession - Saving users' new properties");
    potentialParticipants.forEach((p) => {
      var participantF = p;
      participantF.visitedPExercises = [];
      participantF.visitedIExercises = [];
      participantF.nextExercise = false;
      participantF.save();
    });
  } catch (err) {
    Logger.dbg(`executeStandardSession - error saving users' new properties: ${err}`);
    return;
  }
  
  

  Logger.log("Timing", sessionName, "T1A");
  //Start of the tests, following a time line
  const interval = setInterval(async function () {
    //If this session quantity of tests is the same test than loaded
    const potentialParticipants = await User.find({ //It picks all the registered users in the session
      environment: process.env.NODE_ENV,
      subject: sessionName,
    });

    var participants = [];
    potentialParticipants.forEach((p) => {
      //Filter out the one not connected : they don't have the property socketId! 
      if (p.socketId) {
        //Logger.dbg(`executeStandardSession - participant with code <${p.code}> is connected`);
        participants.push(p);
      }
    });

    //Logger.dbg(`executeStandardSession - participants length: ${participants.length}`);
    if (participants.length % 2 != 0) {
      participants = participants.splice(0, participants.length-1);
    }

    //Logger.dbg(`executeStandardSession - sorting participants list`);
    participants.sort(function(a, b) {
      return a.room - b.room;
    });

    // Calculate the maximum amount of participants possible 
    // Rounding the length to the maximum even number.
    const maxParticipants = (Math.floor(participants.length/2))*2;
    //Logger.dbg(`executeStandardSession - maxParticipants: ${maxParticipants}`);


    for (let p = 0; p < maxParticipants; p++) {
      try {
        var participant1 = participants[p];
        var participant2 = participants[p+1];
        //Logger.dbg(`executeStandardSession - checking actions for participants: ${participant1.code} and ${participant2.code}`);
        
        if (participant1.nextExercise || participant2.nextExercise) {
          Logger.dbg(`executeStandardSession - NEXT EXERCISE - ${participant1.code} or ${participant2.code} tried to validate a code`);
          Logger.dbg(`executeStandardSession - NEXT EXERCISE - User <${participant1.code}> clicked on the button: ${participant1.nextExercise}`);
          Logger.dbg(`executeStandardSession - NEXT EXERCISE - User <${participant2.code}> clicked on the button: ${participant2.nextExercise}`);
        
          Logger.dbg("NEXT EXERCISE - Starting new exercise:");
          if (session.testCounter != 2) {
            var testNumber = session.testCounter;
          } else {
            var testNumber = 0;
          }

          Logger.dbg(`executeStandardSession - NEXT EXERCISE - testNumber: ${testNumber}`);
          let testLanguage = tests[testNumber].language;
          let listExercises = tests[testNumber].exercises;

          Logger.dbg(`executeStandardSession - NEXT EXERCISE - testLanguage: ${testLanguage}`);
          Logger.dbg(`executeStandardSession - NEXT EXERCISE - listExercisesSize: ${listExercises.length}`);
          
          Logger.dbg(`executeStandardSession - NEXT EXERCISE - Calculating the next exercise number for ${(participant1.nextExercise)?"participant1":"participant2"}`);

          var exerciseNumber = (participant1.nextExercise) ? getNextExerciseNumber(participant1, listExercises) : getNextExerciseNumber(participant2, listExercises);
          Logger.dbg(`executeStandardSession - NEXT EXERCISE - Exercise number calculated: <${exerciseNumber}>`);

          if (exerciseNumber >= listExercises.length) {
            exerciseNumber = listExercises.length - 1;
            Logger.dbg(`executeStandardSession - NEXT EXERCISE - Exercise number calculated: <${exerciseNumber}> UPDATED`);
          }
          
          var exercise = listExercises[exerciseNumber];
          Logger.dbg(`executeStandardSession - NEXT EXERCISE - Exercise to be sent is: ${exercise.name}`);

          if (listExercises[0].type == "PAIR") {
            Logger.dbg(`executeStandardSession - NEXT EXERCISE - Exercise type ${listExercises[0].type}`);
            if (participant1.visitedPExercises.length < listExercises.length/2) {
              Logger.dbg(`executeStandardSession - NEXT EXERCISE - There are still exercises (${participant1.visitedPExercises.length} < ${listExercises.length/2}) `);
              if (participant1.nextExercise || participant2.nextExercise) {
                var newEvent = ["newExercise", {
                  data: {
                    maxTime: tests[testNumber].testTime,
                    exerciseDescription: exercise.description,
                    exerciseType: exercise.type,
                    inputs: exercise.inputs,
                    solutions: exercise.solutions,
                    testLanguage: testLanguage,
                    testIndex: session.testCounter,
                  }
                }];
                
                try {
                  Logger.dbg(`executeStandardSession - NEXT EXERCISE - Sending exercise to ${participant1.code} and ${participant2.code}`);
                  io.to(participant1.socketId).emit(newEvent[0], newEvent[1]);
                  io.to(participant2.socketId).emit(newEvent[0], newEvent[1]);
                  
                  lastSessionEvent.set(participant1.socketId, newEvent);
                  lastSessionEvent.set(participant2.socketId, newEvent);
                } catch (err) {
                  Logger.dbgerr(`executeStandardSession - NEXT EXERCISE - Error sending exercise to ${participant1.code} and ${participant2.code}`);
                  Logger.dbgerr(`executeStandardSession - NEXT EXERCISE - Error: ${err}`);
                }
                
                Logger.dbg(`executeStandardSession - NEXT EXERCISE - Sending custom alert "New exercise begins" to ${participant1.code} and ${participant2.code}`);
                io.to(participant1.socketId).emit("customAlert", {
                  data: {
                    message: "New exercise begins"
                  }
                });
                io.to(participant2.socketId).emit("customAlert", {
                  data: {
                    message: "New exercise begins"
                  }
                });
                
                Logger.dbg(`executeStandardSession - NEXT EXERCISE - changing nextExercise property to false`);
                Logger.dbg(`executeStandardSession - NEXT EXERCISE - P1 ACTUAL value ${participant1.nextExercise}`);
                Logger.dbg(`executeStandardSession - NEXT EXERCISE - P2 ACTUAL value ${participant2.nextExercise}`);
                participant1.nextExercise = false;
                participant2.nextExercise = false;
                Logger.dbg(`executeStandardSession - NEXT EXERCISE - P1 UPDATED value ${participant1.nextExercise}`);
                Logger.dbg(`executeStandardSession - NEXT EXERCISE - P2 UPDATED value ${participant2.nextExercise}`);
              }
            } else {
              Logger.dbg(`executeStandardSession - NEXT EXERCISE - changing nextExercise property to false`);
              Logger.dbg(`executeStandardSession - NEXT EXERCISE - P1 ACTUAL value ${participant1.nextExercise}`);
              Logger.dbg(`executeStandardSession - NEXT EXERCISE - P2 ACTUAL value ${participant2.nextExercise}`);
              participant1.nextExercise = false;
              participant2.nextExercise = false;
              Logger.dbg(`executeStandardSession - NEXT EXERCISE - P1 UPDATED value ${participant1.nextExercise}`);
              Logger.dbg(`executeStandardSession - NEXT EXERCISE - P2 UPDATED value ${participant2.nextExercise}`);

              Logger.dbg(`executeStandardSession - NEXT EXERCISE - There are no more exercises left on this test for users ${participant1.code} and ${participant2.code}`);
                Logger.dbg(`executeStandardSession - NEXT EXERCISE - Sending custom alert to ${participant1.code} and ${participant2.code}`);
              io.to(participant1.socketId).emit("customAlert", {
                data: {
                  message: "There are no more exercises left, please wait for the next part."
                }
              });
              io.to(participant2.socketId).emit("customAlert", {
                data: {
                  message: "There are no more exercises left, please wait for the next part."
                }
              });
            }
              
          } else if (listExercises[0].type == "INDIVIDUAL") {
            Logger.dbg(`executeStandardSession - NEXT EXERCISE - Exercise type ${listExercises[0].type}`);
            if (participant1.nextExercise) {
              if (participant1.visitedIExercises.length < listExercises.length) {
                Logger.dbg(`executeStandardSession - NEXT EXERCISE - P1 IND - User with code <${participant1.code}> going to next exercise`);
                var newEvent = ["newExercise", {
                data: {
                  maxTime: tests[testNumber].testTime,
                  exerciseDescription: exercise.description,
                  exerciseType: exercise.type,
                  inputs: exercise.inputs,
                  solutions: exercise.solutions,
                  testLanguage: testLanguage,
                  testIndex: session.testCounter,
                }
              }];
    
              Logger.dbg(`executeStandardSession - NEXT EXERCISE - P1 IND - Sending exercise to ${participant1.code}`);
              io.to(participant1.socketId).emit(newEvent[0], newEvent[1]);
                  
              lastSessionEvent.set(participant1.socketId, newEvent);
              
              io.to(participant1.socketId).emit("customAlert", {
                data: {
                  message: "New exercise begins"
                }
              });
                participant1.nextExercise = false;
              } else {
                participant1.nextExercise = false;
                Logger.dbg(`executeStandardSession - NEXT EXERCISE - P1 IND - There are no more exercises left on this test for user ${participant1.code}`);
                io.to(participant1.socketId).emit("customAlert", {
                  data: {
                    message: "There are no more exercises left on this test"
                  }
                });
              }
            }

            if (participant2.nextExercise) {
              if (participant2.visitedIExercises.length < listExercises.length) {
                Logger.dbg(`executeStandardSession - NEXT EXERCISE - P2 IND - User with code <${participant2.code}> going to next exercise`);
                var newEvent = ["newExercise", {
                data: {
                  maxTime: tests[testNumber].testTime,
                  exerciseDescription: exercise.description,
                  exerciseType: exercise.type,
                  inputs: exercise.inputs,
                  solutions: exercise.solutions,
                  testLanguage: testLanguage,
                  testIndex: session.testCounter,
                }
                }];

                Logger.dbg(`executeStandardSession - NEXT EXERCISE - P2 IND - Sending exercise to ${participant2.code}`);
                io.to(participant2.socketId).emit(newEvent[0], newEvent[1]);
                    
                lastSessionEvent.set(participant2.socketId, newEvent);
                
                io.to(participant2.socketId).emit("customAlert", {
                  data: {
                    message: "New exercise begins"
                  }
                });
                  
                participant2.nextExercise = false;
              } else {
                participant2.nextExercise = false;
                Logger.dbg(`executeStandardSession - NEXT EXERCISE - P2 IND - There are no more exercises left on this test for user ${participant2.code}`);
                io.to(participant2.socketId).emit("customAlert", {
                  data: {
                    message: "There are no more exercises left on this test"
                  }
                });
              }
            }

          }


          if (listExercises[exerciseNumber].type == "PAIR") {
            Logger.dbg(`executeStandardSession - NEXT EXERCISE - Saving next exercise visited to <${participant1.code}> and <${participant2.code}>`);
            participant1.visitedPExercises.push(exerciseNumber);
            participant1.save();
            participant2.visitedPExercises.push(exerciseNumber);
            participant2.save();
          } else {
            if (participant1.nextExercise) {
              Logger.dbg(`executeStandardSession - NEXT EXERCISE - Saving next exercise visited to <${participant1.code}>`);
              participant1.visitedIExercises.push(exerciseNumber);
              participant1.save();
            }
            if (participant2.nextExercise) {
              Logger.dbg(`executeStandardSession - NEXT EXERCISE - Saving next exercise visited to <${participant2.code}>`);
              participant2.visitedIExercises.push(exerciseNumber);
              participant2.save();
            }
          }
        }
      } catch (err) {
        Logger.dbg(`executeStandardSession - Error while trying to check actions for user ${participant1.code} and ${participant2.code}`);
      }
      p++;
    }
    
    if (session.testCounter == 3) {
      Logger.dbg("executeStandardSession - There are no more tests, the session <" + session.name + "> has finish!");
      Logger.dbg("executeStandardSession - emitting 'finish' event in session " + session.name + " #############################");

      io.to(sessionName).emit("finish");
      for (let i = 0; i < participants.length; i++) {
        lastSessionEvent.set(sessionName, ["finish"]);
      }
      Logger.dbg("executeStandardSession - lastSessionEvent saved", event);

      clearInterval(interval);

      for (let p = 0; p < participants.length; p++) {
        var participantF = participants[p];
        participantF.visitedPExercises = [];
        participantF.visitedIExercises = [];
        participantF.nextExercise = false;
        participantF.save();
      }
    } else if (timer > 0) { //If timer hasn't finished counting, it goes down
      io.to(sessionName).emit("countDown", {
        data: timer,
      });
      //Logger.dbg(timer);
      timer--;
    } else if (session.exerciseCounter == maxExercises) { //If timer goes to 0, and exercise in a test is the same as actual exercise, it goes to the next test
      Logger.dbg("executeStandardSession - Going to the next test!");
      session.testCounter++;
      session.exerciseCounter = -1;
      Logger.dbg(`executeStandardSession - emitting 'nextTest' event in session ${session.name} test sent: ${session.testCounter}`);
    } else if (session.exerciseCounter === -1) { //If exercises have been finished, it pass to a new test
      Logger.dbg("executeStandardSession - Loading test");
      Logger.dbg(`executeStandardSession - testCounter: ${session.testCounter} ACTUAL`);
      if (session.testCounter != 2) {
        var testNumber = session.testCounter;
      } else {
        var testNumber = 0;
      }
      Logger.dbg(`executeStandardSession - testCounter: ${session.testCounter} UPDATED`);
      
      var event = ["loadTest", {
        data: {
          testDescription: tests[testNumber].description,
          peerChange: tests[testNumber].peerChange,
          isStandard: true,
          testCounterS: session.testCounter
        },
      }];
      
      Logger.dbg(`executeStandardSession - emitting 'loadTest' event in session ${session.name}`);
      io.to(sessionName).emit(event[0], event[1]);

      lastSessionEvent.set(sessionName, event);
      Logger.dbg("executeStandardSession - lastSessionEvent saved", event[0]);

      timer = tests[testNumber].time; //Resets the timer
      session.exerciseCounter = 0;
      Logger.dbg("executeStandardSession - testCounter: " + session.testCounter + " of " + numTests + " , exerciseCounter: " + session.exerciseCounter + " of " + maxExercises);

    } else if (session.exerciseCounter == 0) { //If nothing before happens, it means that there are more exercises to do, and then in goes to the next one
      if (session.testCounter != 2) {
        var testNumber = session.testCounter;
      } else {
        var testNumber = 0;
      }

      Logger.dbg("executeStandardSession - Starting new exercise:");
      let testLanguage = tests[testNumber].language;
      let listExercises = tests[testNumber].exercises;
      
      // Calculate the maximum amount of participants possible 
      // Rounding the length to the maximum even number.
      const maxParticipants = (Math.floor(participants.length/2))*2;

      Logger.dbg("executeStandardSession - Send a initial exercieses to to each pair");
      for (let p = 0; p < maxParticipants; p++) {
        var participant1 = participants[p];
        var participant2 = participants[p+1];

        Logger.dbg("executeStandardSession - FIRST EXERCISE - Calculating FIRST exercise");
        var exerciseNumber = getNextExerciseNumber(participant1, listExercises);
        var exercise = listExercises[exerciseNumber];

        Logger.dbg(`executeStandardSession - FIRST EXERCISE - Sending exercise <${exerciseNumber}> to participant1 <${participant1.code}>`);
        io.to(participant1.socketId).emit("newExercise", {
          data: {
            maxTime: tests[testNumber].testTime,
            exerciseDescription: exercise.description,
            exerciseType: exercise.type,
            inputs: exercise.inputs,
            solutions: exercise.solutions,
            testLanguage: testLanguage,
            testIndex: session.testCounter,
          }
        });

        lastSessionEvent.set(participant1.socketId, ["newExercise", {
          data: {
            maxTime: tests[testNumber].testTime,
            exerciseDescription: exercise.description,
            exerciseType: exercise.type,
            inputs: exercise.inputs,
            solutions: exercise.solutions,
            testLanguage: testLanguage,
            testIndex: session.testCounter,
          }
        }]);

        lastSessionEvent.set(participant2.socketId, ["newExercise", {
          data: {
            maxTime: tests[testNumber].testTime,
            exerciseDescription: exercise.description,
            exerciseType: exercise.type,
            inputs: exercise.inputs,
            solutions: exercise.solutions,
            testLanguage: testLanguage,
            testIndex: session.testCounter,
          }
        }]);

        Logger.dbg(`FIRST EXERCISE - Sending exercise <${exerciseNumber}> to participant2 <${participant2.code}>`);
        io.to(participant2.socketId).emit("newExercise", {
          data: {
            maxTime: tests[testNumber].testTime,
            exerciseDescription: exercise.description,
            exerciseType: exercise.type,
            inputs: exercise.inputs,
            solutions: exercise.solutions,
            testLanguage: testLanguage,
            testIndex: session.testCounter,
          }
        });

        io.to(participant1.socketId).emit("customAlert", {
          data: {
            message: "New exercise begins"
          }
        });
        io.to(participant2.socketId).emit("customAlert", {
          data: {
            message: "New exercise begins"
          }
        });
        

        participant1.visitedPExercises.push(exerciseNumber);
        participant1.save();
        participant2.visitedPExercises.push(exerciseNumber);
        participant2.save();
      

        p++;
      }

      lastSessionEvent.set(sessionName, event);
      Logger.dbg("executeStandardSession - lastSessionEvent saved", "newExercise");

      sessions.set(session.name, {
        session: session,
        exerciseType: listExercises[0].type,
      });

      timer = timer == 0 ? tests[testNumber].testTime : timer;

      session.exerciseCounter++; //After that, it increments the counter to test in the before code if thera are more or not
      Logger.dbg(" testCounter: " + session.testCounter + " of " + numTests + " , exerciseCounter: " + session.exerciseCounter + " of " + maxExercises);

      session.save();
      Logger.dbg("executeStandardSession - session saved ");
    } else {
      //---------------------------
      if (session.testCounter == 0) {
        Logger.log("Timing", sessionName, "T1B");
      } else if (session.testCounter == 1) {
        Logger.log("Timing", sessionName, "T2A");
      } else if (session.testCounter == 2) {
        Logger.log("Timing", sessionName, "T2B");
      } 

      Logger.dbg("executeStandardSession - Going to the next test!");
      session.testCounter++;
      session.exerciseCounter = -1;
      
      Logger.dbg("executeStandardSession - Loading test");
              
      if (session.testCounter < 2) {
        var testNumber = session.testCounter;
      } else {
        var testNumber = 0;
      }
      
      var event = ["loadTest", {
        data: {
          testDescription: tests[testNumber].description,
          peerChange: tests[testNumber].peerChange,
          isStandard: true,
          testCounterS: session.testCounter
        },
      }];
      
      
      for (let p = 0; p < maxParticipants; p++) {
        participants[p].visitedPExercises = [];
        if (session.testCounter == 2) {
          Logger.dbg(`executeStandardSession - changing exerciseSwitch <${participants[p].exerciseSwitch}> for code <${participants[p].code}>`);
          participants[p].exerciseSwitch = !participants[p].exerciseSwitch;
          Logger.dbg(`executeStandardSession - changed exerciseSwitch <${participants[p].exerciseSwitch}> for code <${participants[p].code}>`);
        }
        participants[p].save();

        io.to(participants[p].socketId).emit(event[0], event[1]);
        lastSessionEvent.set(participants[p].socketId, event);
      }

      Logger.dbg("executeStandardSession - lastSessionEvent saved", event[0]);


      timer = tests[testNumber].time; //Resets the timer
      session.exerciseCounter = 0;
      Logger.dbg("executeStandardSession - testCounter: " + session.testCounter + " of " + numTests + " , exerciseCounter: " + session.exerciseCounter + " of " + maxExercises);

    }


    //If the session is not running, it's beacuse it has not been active or it has finished, so it clears all before
    Session.findOne({
      name: sessionName,
      environment: process.env.NODE_ENV,
    }).then((currentSession) => {
      if (!currentSession.running) {
        clearInterval(interval);
        Logger.dbg("executeStandardSession - clearInterval");
      }
    });
  }, 1000);

}


/* 
  TODO This function has been cloned from the execute standard session it has only been proved with standard sessions.
  Technical debt: This function should be reviewed in detail and tested in order to be sure that it works properly in a custom session.
  Also, there are some pieces of code than potentially only are used in standard sessions that should be removed.
*/
async function executeCustomSession(session, io) {
  var sessionName = session.name;

  session.running = true;
  session.save(); //Saves it on database
  Logger.dbg("executeSession - Running ", session, ["name", "pairingMode", "tokenPairing", "blindParticipant"]);
  //Pick all tests
  const tests = await Test.find({
    session: session.name,
    environment: process.env.NODE_ENV,
  }).sort({ orderNumber: 1 });
  //Number of tests in a session
  const numTests = tests.length;
  //testCounter = session attribute that shows the order of the tests (actual test)
  let timer = 0;
  let maxExercises = tests[session.testCounter].exercises.length;

  Logger.dbg("executeSession - testCounter: " + session.testCounter + " of " + numTests + " , exerciseCounter: " + session.exerciseCounter + " of " + maxExercises);
  //Here it is loaded the test
  var event = ["loadTest", {
    data: {
      testDescription: tests[0].description,
      peerChange: tests[0].peerChange,
      isStandard: session.isStandard,
      testCounterS: session.testCounter
    }
  }];

  io.to(sessionName).emit(event[0], event[1]);

  lastSessionEvent.set(sessionName, event);
  Logger.dbg("executeSession - lastSessionEvent saved", event[0])  
  
  
  const potentialParticipants = await User.find({ //It picks all the registered users in the session
    environment: process.env.NODE_ENV,
    subject: sessionName,
  });

  potentialParticipants.forEach((p) => {
    var participantF = p;
    participantF.visitedPExercises = [];
    participantF.visitedIExercises = [];
    participantF.nextExercise = false;
    participantF.save();
  });
  
  

  //Start of the tests, following a time line
  const interval = setInterval(async function () { 
      if (session.testCounter == numTests) {
        Logger.dbg("There are no more tests, the session <" + session.name + "> has finish!");
        Logger.dbg("executeSession - emitting 'finish' event in session " + session.name + " #############################");
  
        io.to(sessionName).emit("finish");
        lastSessionEvent.set(sessionName, ["finish"]);
        Logger.dbg("executeSession - lastSessionEvent saved", event);
  
        clearInterval(interval);
      } else if (timer > 0) { //If timer hasn't finished counting, it goes down
        io.to(sessionName).emit("countDown", {
          data: timer,
        });
        Logger.dbg(timer);
        timer--;
      } else if (session.exerciseCounter == maxExercises) { //If timer goes to 0, and exercise in a test is the same as actual exercise, it goes to the next test
        Logger.dbg("Going to the next test!");
        session.testCounter++;
        session.exerciseCounter = -1;
      } else if (session.exerciseCounter === -1) { //If exercises have been finished, it pass to a new test
        Logger.dbg("Loading test");
  
        var event = ["loadTest", {
          data: {
            testDescription: tests[session.testCounter].description,
            peerChange: tests[session.testCounter].peerChange,
            isStandard: false,
            testCounterS: session.testCounter
          },
        }];
        io.to(sessionName).emit(event[0], event[1]);
  
        lastSessionEvent.set(sessionName, event);
        Logger.dbg("executeSession - lastSessionEvent saved", event[0]);
  
  
        timer = tests[session.testCounter].time; //Resets the timer
        session.exerciseCounter = 0;
        Logger.dbg("executeSession - testCounter: " + session.testCounter + " of " + numTests + " , exerciseCounter: " + session.exerciseCounter + " of " + maxExercises);
  
      } else { //If nothing before happens, it means that there are more exercises to do, and then in goes to the next one
        Logger.dbg("Starting new exercise:");
        let testLanguage = tests[session.testCounter].language;
        let exercise =
          tests[session.testCounter].exercises[session.exerciseCounter];
        if (exercise) {
          Logger.dbg("   " + exercise.description.substring(0, Math.min(80, exercise.description.length)) + "...");
  
          var event = ["newExercise", {
            data: {
              maxTime: exercise.time,
              exerciseDescription: exercise.description,
              exerciseType: exercise.type,
              inputs: exercise.inputs,
              solutions: exercise.solutions,
              testLanguage: testLanguage,
              testIndex: session.testCounter,
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
        session.exerciseCounter++; //After that, it increments the counter to test in the before code if thera are more or not
        Logger.dbg(" testCounter: " + session.testCounter + " of " + numTests + " , exerciseCounter: " + session.exerciseCounter + " of " + maxExercises);
  
        session.save();
        Logger.dbg("executeSession - session saved ");
      }

    //If the session is not running, it's beacuse it has not been active or it has finished, so it clears all before
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

//Executing a new session and testing the following exercise it has to be launched
async function executeSession(sessionName, io) {
  //Pick up a session by its name, and puts in true the "running" attribute
  lastSessionEvent.set(sessionName, []);
  Logger.dbg("executeSession - Cleared last event of session " + sessionName);

  Logger.dbg("executeSession - Starting " + sessionName);
  const session = await Session.findOne({
    name: sessionName,
    environment: process.env.NODE_ENV,
  });

  if (session.isStandard) {
    executeStandardSession(session, io);
  } else {
    executeCustomSession(session, io);
  }
}


//This is the "pairing method" and where the rooms are given and configured, and the first test started
async function notifyParticipants(sessionName, io) {
  const potentialParticipants = await User.find({ //It picks all the registered users in the session
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

  //If participant is logged (so this function is executed after pressing the "Start sessiobn" button), he/she is introduced to "participants" list

  if (participants.length < 2) { //There must be at least 2 participants to start the session
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

  //If there are an odd number of participants, one of them randomly will be disconnected
  if ((participantCount % 2) == 0)
    Logger.dbg("notifyParticipants - the participant count is even, PERFECT PAIRING! :-)");
  else {
    excluded = participants[participantCount - 1];
    Logger.dbg("notifyParticipants - the participant count is odd: IMPERFECT PAIRING :-(");
    Logger.dbg("   -> One participant will be excluded: ", excluded, ["code", "mail"]);
    participants = participants.slice(0, participantCount-1);
  }

  var initialRoom = 100; //First room (So in pairing, ther can be as minimum, 200 participants, that will be in pairs from room 0 to room 99 before they are well paired)

  Logger.dbg("notifyParticipants - Re-assigning rooms to avoid race conditions!");


  
  //Participants array shuffled
  participants = shuffleArray(participants);

  
  //Random shown genres randomized and 50% Male and 50% Female
  var genres_list = []
  for (j = 0; j < participants.length; j++) {
    var newGeneratedGenre = "Male";
    if (j > (participants.length / 2) - 1) {
      newGeneratedGenre = "Female";
    }
    genres_list.push(newGeneratedGenre);
  }
  genres_list = shuffleArray(genres_list);

  //Here starts the pairing method
  var nonMaleList = []
  var maleList = []
  for (j = 0; j < participants.length; j++) {
    Logger.dbg("GENDER User, Old shown gender ", [participants[j].code, participants[j].shown_gender]);
    participants[j].shown_gender = genres_list[j];
    Logger.dbg("GENDER User, New shown gender ", [participants[j].code, participants[j].shown_gender]);
    if (participants[j].gender == "Male") {
      maleList[maleList.length] = participants[j];
    }
    else {
      nonMaleList[nonMaleList.length] = participants[j];
    }
  }

  //Before, we have divide all the participants into Male or Non male (Female, non-binary, etc)
  l = nonMaleList.concat(maleList);


  //Half of male will be on conrtol list, and the other half, on experiment. It happens the same with non-male group
  var controlList = [];
  var expertimentList = [];

  for (ui = 0; ui < l.length; ui++) {
    if (ui % 2 == 0) expertimentList[expertimentList.length] = l[ui];
    else controlList[controlList.length] = l[ui];
  }

  participantNumber = 0;

  for (i = 0; i < roomCount; i++) {
    //Now we put together 1 participant of each group (control and experiment)
    let peer1 = controlList[i];
    let peer2 = expertimentList[i];

    peer1.room = i + initialRoom;
    peer2.room = i + initialRoom;

    //The control group will see avatar if wanted, and experiment will never see avatar
    peer1.blind = session.blindParticipant;
    peer2.blind = false;
    
    Logger.dbg("notifyParticipants - Pair created in room <" + peer1.room + ">:\n" +
      "    -" + peer1.code + ", " + peer1.firstName + ", " + peer1.firstName + ", " + peer1.gender + ", " + peer1.blind + "\n" +
      "    -" + peer2.code + ", " + peer2.firstName + ", " + peer2.firstName + ", " + peer2.gender + ", " + peer2.blind);
  }



  participants.forEach((p) => {
    Logger.dbg("notifyParticipants - connected participants: ", p, ["code", "mail", "room", "blind"]);
  });

  connectedUsers = new Map();

  Logger.dbg("notifyParticipants - connectedUsers cleared", connectedUsers);


  for (const participant of participants) { //To each participant

    /** VERBOSE DEBUG ******************************************************************
    Logger.dbg("notifyParticipants - excluded: ",excluded,["code"]);
    Logger.dbg("notifyParticipants - participant: ",participant,["code"]);
    Logger.dbg("notifyParticipants - (<"+excluded.code+"> == <"+participant.code+">)?");
    ************************************************************************************/

    if (excluded.code != participant.code) {
      //If this participant is not the one excluded, It saves all the before changes on the database from here to the next comment * 
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
      user.exerciseSwitch = (myRoom%2==0);
      user.shown_gender = myBlind?participant.shown_gender:'None';

      Logger.dbg("notifyParticipants - Saving user", user, ["code", "firstName", "gender", "room", "blind", "shown_gender"]);
      user.save();
      // Until here, all the changes have been saved on database *

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


      var newGender = session.isStandard ? pair.shown_gender : pair.gender;
      Logger.dbg("notifyParticipans - gender sent ",newGender);
      Logger.dbg("notifyParticipans - pair socket ",pair.socketId);


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


/*  
  This is the main function, the one that calls the others
  It contains some "properties" / functions, that are called in other scripts
  It's a kind of Object converter. It's like self. functions of the Consumer.js object
*/ 
module.exports = {
  //This starts the session calling notifyParticipants to pair them and give them a room
  startSession: function (sessionName, io) {
    Logger.dbg("startSession " + sessionName);
    //Room giving
    notifyParticipants(sessionName, io);
    //Wait 5000 ms, 5s, and then, execute the session
    setTimeout(() => {
      executeSession(sessionName, io);
    }, 5000);
  },
  //On this funcition, the server test some things with socket.on(), like if admin is connected and do some actions as disconnect
  start: function (io) {
    function connection(socket) {
      Logger.dbg("NEW CONNECTION " + socket.id);

      Logger.log(
        "NewConn",
        socket.id,
        "New user with socket id " + socket.id + " has entered"
      );

      socket.on("adminConnected", (session) => {
        try {
          Logger.dbg("EVENT adminConnected", session);
          Logger.dbg("Admin watching " + session);
          socket.join(session);
        } catch (err) {
          Logger.dbg(`EVENT adminConnected - ERROR <${err}>`);
        }
      });

      socket.on("clientConnected", async (pack) => {
        Logger.dbg("EVENT clientConnected", pack);

        const user = await User.findOne({
          code: pack,
          environment: process.env.NODE_ENV,
        });
        if (user) {
          Logger.dbg(`EVENT clientConnected - User found <${user.code}>`);
          io.to(user.subject).emit("clientConnected", user.code);
        }
        else {
          Logger.dbg("EVENT clientConnected - ERROR - USER NOT FOUND");
        }
      });

      socket.on("requestToJoinAgain", (pack) => {
        Logger.dbg("Asking " + pack + " to rejoin.");
        try {
          io.to(pack).emit("clientJoinAgain");
        } catch (err) {
          Logger.dbg(`EVENT requestToJoinAgain - ERROR <${err}>`);
        }
      });

      socket.on("clientReady", async (pack) => {
        Logger.dbg("EVENT clientReady", pack);

        const user = await User.findOne({
          code: pack,
          environment: process.env.NODE_ENV,
        });

        if (!user) {
          Logger.dbg("EVENT clientReady - ERROR - USER NOT FOUND");
          return;
        }

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
        else {
          Logger.dbg(`EVENT clientReady - Session not found`)
        }
      });

      socket.on("changeExercise", async (pack) => {
        Logger.dbg(`EVENT changeExercise - User in socket <${socket.id}> with data <${pack}>`);
        const user = await User.findOne({
          code: pack.code,
          environment: process.env.NODE_ENV,
        });
        if (user) {
          Logger.dbg(`EVENT changeExercise - user(${pack.code}).nextExercise (pre) : <${user.nextExercise}> `,user,["mail"]);

          if (pack.exercisedCharged) {
            user.nextExercise = false;
          } else {
            user.nextExercise = true;
          }       
          
          await user.save();
          Logger.dbg(`EVENT changeExercise - user(${pack.code}).nextExercise (post) : <${user.nextExercise}> `,user,["mail"]);
        }
        else {
          Logger.dbg(`EVENT changeExercise - user not found`);
        }
      });

      socket.on("clientReconnection", async (pack) => {
        Logger.dbg("EVENT clientReconnection ",pack);
        const user = await User.findOne({
          code: pack,
          environment: process.env.NODE_ENV,
        });
        if (user) {
          tokens.set(pack, user.subject);
          
          Logger.dbg("EVENT clientReconnection - user found", user, ["code", "socketId"]);
          var oldSocket = user.socketId;

          userToSocketID.set(user.code, socket.id);
          user.socketId = socket.id;
          socket.join(user.subject);

          Logger.dbg("EVENT clientReconnection - Saving user", user, ["code", "firstName", "gender", "room", "blind"]);
          await user.save();

          Logger.dbg("EVENT clientReconnection - socketId updated", user, ["code", "socketId"]);

          const userSession = await Session.findOne({
            name: user.subject
          });

          const peer = await User.findOne({
            room: user.room,
            subject: user.subject,
            environment: process.env.NODE_ENV,
            code: { $ne: user.code }
          });
          // If peer not null, create var peerSocketId
          var peerSocketId = null;
          if (peer) {
            peerSocketId = peer.socketId;
          }
          // RECOVER LAST EVENT OF USER SESSION
          let lastEvent = lastSessionEvent.get(oldSocket)??lastSessionEvent.get(peerSocketId);
          lastSessionEvent.set(user.socketId, lastEvent);
          Logger.dbg("EVENT clientReconnection - last event", lastEvent)
          Logger.dbg("EVENT clientReconnection - last session event", lastSessionEvent)
          if (lastEvent) {
            Logger.dbg("EVENT clientReconnection - Last Recovered Event", lastEvent[0]);
            if (lastEvent.length == 1) {
              Logger.dbg("EVENT clientReconnection - Submitted last event without data", lastEvent[0]);
              io.to(user.socketId).emit(lastEvent[0]);
            } else {
              Logger.dbg("EVENT clientReconnection - Submitted last event with data", lastEvent[0]);
              Logger.dbg("EVENT clientReconnection - Submitted last event with data", lastEvent[1]);

              // SEND LAST EVENT OF THE SESSION TO RECONNECTED USER
              io.to(user.socketId).emit(lastEvent[0], lastEvent[1]);

              if (lastEvent[0] == "newExercise" && lastEvent[1]) {
                Logger.dbg("EVENT clientReconnection - Session in the middle of an exercise.");

                if (lastEvent[1].data && lastEvent[1].data.exerciseType == "PAIR") {
                  Logger.dbg("EVENT clientReconnection - Session in the middle of an exercise to be done in PAIRs...");

                  if (peer) {
                    Logger.dbg("EVENT clientReconnection - Peer found for " + user.code, peer, ["code"]);
                    io.to(peerSocketId).emit("userReconnectingEvent", true);
                    io.to(peerSocketId).emit("requestBulkCodeEvent", user.socketId);
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
            Logger.dbg("EVENT clientReconnection : LAST EVENT NOT FOUND for session " + user.subject);
          }

        } else {
          Logger.dbg("EVENT clientReconnection : USER NOT FOUND", pack);
        }

      });
      socket.on("userReconnectingEnd", async (pack) => {
        Logger.dbg("EVENT userReconnectingEnd ", pack);
        io.to(pack.data.peerSocketId).emit("userReconnectingEvent", pack.data.status);
      });
      socket.on("bulkCode", async (pack) => {
        Logger.dbg("EVENT bulkCode ", pack);
        io.to(pack.data.peerSocketId).emit("bulkCodeUpdate", {
          code: pack.data.code,
          peerSocketId: pack.data.socketId,
        });
        Logger.dbg("EVENT clientReconnection - Submitted bulkCodeUpdate to peer " + pack.data.peerSocketId, pack.data.code);
      });

      socket.on("cursorActivity", (data) => {
        Logger.dbg("EVENT cursorActivity ", data);
        io.to(connectedUsers.get(socket.id)).emit("cursorActivity", data);
      });

      socket.on("updateCode", (pack) => {
        Logger.dbg("EVENT updateCode",pack);

        const sessionInMemory = sessions.get(tokens.get(pack.token));

        if (sessionInMemory != null) {
          if (sessions.get(tokens.get(pack.token)).exerciseType == "PAIR") {
            // Too expensive dbg:
            // Logger.dbg("EVENT updateCode --> " + userToSocketID.get(connectedUsers.get(pack.token)));
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
        else {
          Logger.dbg("EVENT updateCode - Session not found in memory");
        }
      });

      socket.on("msg", async (pack) => {
        Logger.dbg("EVENT msg", pack);

        if (sessions.get(tokens.get(pack.token)) == null) {
          Logger.dbg("EVENT msg - MESSAGE SENT when exercise hasn't started!!!: Ignored ", pack.token);
          Logger.dbg("EVENT msg - tokens ", tokens);
          Logger.dbg("EVENT msg - tokens.get(pack.token) ", tokens.get(pack.token));
          return;
        }
        console.log("EVENT msg - tokens.get(pack.token) ", tokens.get(pack.token));

        // if pair is a bot (code starts with "B"), then use the bot api to answer

        var user = await User.findOne({
          code: pack.token,
          environment: process.env.NODE_ENV,
        });

        var botPeer = await User.findOne({
          code: { $ne: user.code, $regex: /^B/ },
          room: user.room,
          environment: process.env.NODE_ENV,
          subject: user.subject,
        });

        if (botPeer) {
          Logger.dbg("EVENT msg - Bot detected: ", botPeer, ["code"]);
          sendMsgToLeia(pack, user.subject, user.room, io);
        } else {
          io.sockets.emit("msg", pack.data.message);
        }

        Logger.log(
          "Chat",
          pack.token,
          pack.data.message,
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

      socket.on("sendValidation", async (data) => {
        Logger.dbg("EVENT sendValidation", data);
        try {
          if (!socket) {
            Logger.dbg("EVENT sendValidation - socket is null");
            return;
          }
          const user = await User.findOne({
            socketId: socket.id,
            environment: process.env.NODE_ENV,
          });

          if(!user) {
            Logger.dbg("EVENT sendValidation - user is null");
            return;
          }

          Logger.dbg(`EVENT sendValidation - user <${user.code}>` );

          const pair = await User.findOne({
            subject: user.subject,
            room: user.room,
            code: { $ne: user.code },
            environment: process.env.NODE_ENV,
          });

          if(!pair) {
            Logger.dbg("EVENT sendValidation - pair is null");
            return;
          }

          Logger.dbg(`EVENT sendValidation - sending to pair <${pair}>` );

          io.to(pair.socketId).emit("receiveValidation", data);

        } catch (err) {
          Logger.dbgerr(`EVENT sendValidation - ERROR <${err}>`);
        }
      })

      socket.on("registry", async (pack) => {
        Logger.dbg("EVENT registry", pack);
        Logger.dbg("Registry event for: " + socket.id + "," + pack.uid);

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

        Logger.dbg("###################################################");
        Logger.dbg("User to enter in room: " + JSON.stringify(user, null, 2));

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

      socket.on("sendButtonStatusToPeer", async(data) => {
        try {
          if (!socket) {
            Logger.dbg("EVENT sendButtonStatusToPeer - socket is null");
            return;
          }
          const user = await User.findOne({
            socketId: socket.id,
            environment: process.env.NODE_ENV,
          });

          if(!user) {
            Logger.dbg("EVENT sendButtonStatusToPeer - user is null");
            return;
          }

          Logger.dbg(`EVENT sendButtonStatusToPeer - user <${user.code}>` );

          const usersPaired = await User.find({
            subject: user.subject,
            room: user.room,
            environment: process.env.NODE_ENV,
          });

          if(!usersPaired) {
            Logger.dbg("EVENT sendButtonStatusToPeer - usersPaired is null");
            return;
          }

          Logger.dbg(`EVENT sendButtonStatusToPeer - usersPaired <${usersPaired}>` );

          const pair = usersPaired.filter((p) => {
            return (p.room == user.room) && (p.code != user.code);
          })[0];

          if(!pair) {
            Logger.dbg("EVENT sendButtonStatusToPeer - pair is null");
            return;
          }

          try {
            Logger.dbg(`EVENT sendButtonStatusToPeer - data: ${data.status} - pair code: ${pair.code}`);
            Logger.dbg(`EVENT sendButtonStatusToPeer - pair socket: ${pair.socketId} - user socket: ${user.socketId}`);
          } catch (err) {
            Logger.dbgerr(`EVENT sendButtonStatusToPeer - error: ${err}`);
          }

          var session = Session.findOne({
            name: user.subject
          });
          
          if(!session) {
            Logger.dbg("EVENT sendButtonStatusToPeer - session is null");
            return;
          }
          else if (session.testCounter != 1) {
            Logger.dbg(`EVENT sendButtonStatusToPeer - session <${session.name}>`);
            Logger.dbg(`EVENT sendButtonStatusToPeer - Sending to socket <${pair.socketId}> from user <${pair.code}> status <${data.status}>, clicked by user <${user.code}>`);
            io.to(pair.socketId).emit("hideShowButton", {
              hideShowButton: data.status,
            });
          }
        } catch (err) {
          if(socket)
            Logger.dbgerr(`EVENT sendButtonStatusToPeer - socket ID <${socket.id}>`);
          else
            Logger.dbgerr(`EVENT sendButtonStatusToPeer - NULL SOCKET!`);

          Logger.dbgerr(`EVENT sendButtonStatusToPeer - ${err}`);
        }
      });

      socket.on("sendControlStatusToPeer", async(data) => {
        try {
          if (!socket) {
            Logger.dbgerr("EVENT sendControlStatusToPeer - socket is null");
            return;
          }

          const user = await User.findOne({
            socketId: socket.id,
            environment: process.env.NODE_ENV,
          });

          if(!user) {
            Logger.dbgerr("EVENT sendControlStatusToPeer - user is null");
            return;
          }

          Logger.dbg(`EVENT sendControlStatusToPeer - user <${user.code}>` );
          
          const usersPaired = await User.find({
            subject: user.subject,
            room: user.room,
            environment: process.env.NODE_ENV,
          });

          if(!usersPaired) {
            Logger.dbgerr("EVENT sendControlStatusToPeer - usersPaired is null");
            return;
          }

          Logger.dbg(`EVENT sendControlStatusToPeer - usersPaired <${usersPaired}>` );

          const pair = usersPaired.filter((p) => {
            return (p.room == user.room) && (p.code != user.code);
          })[0];

          if(!pair) {
            Logger.dbgerr("EVENT sendControlStatusToPeer - pair is null");
            return;
          }

          try {
            Logger.dbg(`EVENT sendControlStatusToPeer - data: ${data.status} - pair code: ${pair.code}`);
            Logger.dbg(`EVENT sendControlStatusToPeer - pair socket: ${pair.socketId} - user socket: ${user.socketId}`);
          } catch (err) {
            Logger.dbgerr(`EVENT sendControlStatusToPeer - error: ${err}`);
          }

          io.to(pair.socketId).emit("receiveControlStatus", {
            status: data.status,
          });

          if (sessions.get(tokens.get(user.code)) == null) {
            Logger.dbgerr("EVENT sendControlStatusToPeer - Session not found, token: ", user.code);
            Logger.dbgerr("EVENT sendControlStatusToPeer - tokens ", tokens);
            Logger.dbgerr("EVENT sendControlStatusToPeer - tokens.get(pack.token) ", tokens.get(user.code));
            Logger.dbgerr("EVENT sendControlStatusToPeer - Sessions ", sessions);
            return;
          }
          
          Logger.dbg("EVENT sendControlStatusToPeer - Session found: ", sessions.get(tokens.get(user.code)));

          Logger.log("Control",
                      user.code,
                      { room: user.room },
                      sessions.get(tokens.get(user.code)).session.exerciseCounter,
                      sessions.get(tokens.get(user.code)).session.testCounter);

        } catch (err) {
          if(socket)
            Logger.dbgerr(`EVENT sendControlStatusToPeer - socket ID <${socket.id}>`);
          else
            Logger.dbgerr(`EVENT sendControlStatusToPeer - NULL SOCKET!`);

          Logger.dbgerr(`EVENT sendControlStatusToPeer - ${err}`);
        }
      });

      socket.on("startDebugSession", async (pack) => {
        if (process.env.NODE_ENV === "local") await executeSession("TFM", io);
      });

      socket.on("disconnect", async () => {
        if (!socket) {
          Logger.dbg("EVENT disconnect - socket is null");
          return;
        }

        const user = await User.findOne({
          socketId: socket.id,
          environment: process.env.NODE_ENV,
        });
        if (user) {
          io.to(user.subject).emit("clientDisconnected", user.code);
        }
        else {
          Logger.dbg("EVENT disconnect - user is null");
        }
      });


      // In case of a failure in the connection.
      io.to(socket.id).emit("reconnect");
    }

    io.on("connection", connection);
  },
};
