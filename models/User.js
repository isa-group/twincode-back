require("dotenv").config();
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const UserSchema = new Schema({
  signedUpOn: { type: Date, default: Date.now },
  environment: { type: String, default: process.env.NODE_ENV },
  code: { type: String, required: true },
  firstName: { type: String, required: true },
  surname: { type: String, required: true },
  mail: { type: String, required: true },
  academicMail: { type: String },
  gender: { type: String, required: true },
  birthDate: { type: Date, required: true },
  subject: { type: String, required: true },
  beganStudying: { type: Number, required: true },
  numberOfSubjects: { type: Number, required: true },
  knownLanguages: { type: String, required: true },
  room: { type: Number },
  token: { type: String },
  socketId: { type: String },
  lastExercise: { type: Number },
  currentTest: { type: Number },
});

UserSchema.index({ code: 1 });

module.exports = mongoose.model("User", UserSchema);
