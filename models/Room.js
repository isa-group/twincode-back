require("dotenv").config();
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const RoomSchema = new Schema({
  startedOn: { type: Date, default: Date.now },
  environment: { type: String, default: process.env.NODE_ENV },
  name: { type: String, required: true },
  session: { type: String, required: true },
  lastExercise: { type: Number, required: true },
  currentTest: { type: Number },
  finished: { type: Boolean, default: false },
});

RoomSchema.index({ name: 1 });

module.exports = mongoose.model("Room", RoomSchema);
