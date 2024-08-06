require("dotenv").config();

const dbConnect = require("./db");
const app = require("./server.js");
const consumer = require("./consumer.js");
const socket = require("socket.io");
const Logger = require("./logger.js");
const { initializeSystemConfig } = require("./models/SystemConfig");

// Global utility constants
const PORT = process.env.PORT || 3001;

dbConnect().then(
  async () => {
    await initializeSystemConfig();
    const server = await app.listen(PORT, () => {
      Logger.monitorLog("Listening on port " + PORT);
      Logger.dbg("Listening on port " + PORT);
    });
    const io = socket(server);
    consumer.start(io);
    Logger.dbg("Saving io / consumer on server.");
    app._io = io;
    app._consumer = consumer;
    Logger.dbg("app.io:"+app._io+", app.comsumer:"+app._consumer);
  },
  (err) => {
    console.log("Connection error: " + err);
    Logger.dbgerr("Connection error",err);
  }
);
