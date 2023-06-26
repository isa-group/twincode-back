const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const TestSchema = new Schema({
  environment: { type: String },
  session: { type: String, required: true },
  name: { type: String, required: true },
  description: { type: String, required: true },
  exercises: { type: Array },
  activeSince: { type: Date },
  orderNumber: { type: Number },
  time: { type: Number },
  testTime: { type: Number, required: true, default: 300 },
  language: { type: String, required: true },
  peerChange: { type: Boolean },
  type: { type: String, required: true },
});

module.exports = mongoose.model("Test", TestSchema);
