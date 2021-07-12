const mongoose = require("mongoose");
const Schema = mongoose.Schema;
var Exercise = require("../models/Exercise.js").schema;

const TestSchema = new Schema({
  environment: { type: String },
  session: { type: String, required: true },
  name: { type: String, required: true },
  description: { type: String, required: true },
  exercises: { type: [Exercise] },
  activeSince: { type: Date },
  orderNumber: { type: Number },
  time: { type: Number },
  peerChange: { type: Boolean },
});

module.exports = mongoose.model("Test", TestSchema);
