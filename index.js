require("dotenv").config();

const dbConnect = require("./db");
const app = require("./server.js");
const consumer = require("./consumer.js");
const socket = require("socket.io");
const Logger = require("./logger.js");

// Global utility constants
const PORT = process.env.PORT || 3000;

dbConnect().then(
  async () => {
    const server = await app.listen(PORT, () => {
      Logger.monitorLog("Listening on port " + PORT);
    });
    const io = socket(server);
    consumer.start(io);
    app.io = io;
    app.consumer = consumer;
  },
  (err) => {
    console.log("Connection error: " + err);
  }
);
