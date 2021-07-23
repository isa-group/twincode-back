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
  peerChange: { type: Boolean },
});

module.exports = mongoose.model("Test", TestSchema);
