const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const SessionSchema = new Schema({
  environment: { type: String },
  name: { type: String, required: true },
  active: { type: Boolean, default: false },
  tokens: { type: Array, required: true },
  tokenPairing: { type: Boolean, default: false },
  testCounter: { type: Number, default: 0 },
  exerciseCounter: { type: Number, default: -1 },
  running: { type: Boolean, default: false },
  pairingMode: { type: String, default: "MANUAL" },
  registrationText: { type: String },
  finishMessage: { type: String },
  blindParticipant: { type: Boolean, default: true },
  isStandard: { type: Boolean, default: false },
});

SessionSchema.index(
  {
    environment: 1,
    name: 1,
  },
  { unique: true }
);

module.exports = mongoose.model("Session", SessionSchema);
