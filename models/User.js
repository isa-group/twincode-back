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
  shown_gender: { type: String, required: true },
  jsexp: { type: String, required: false },
  birthDate: { type: Date, required: true },
  subject: { type: String, required: true },
  beganStudying: { type: Number, required: true },
  numberOfSubjects: { type: Number },
  knownLanguages: { type: String },
  room: { type: Number },
  token: { type: String },
  socketId: { type: String },
  lastExercise: { type: Number },
  currentTest: { type: Number },
  blind: { type: Boolean },
  visitedPExercises: { type: Array, required: true, default: [] },
  visitedIExercises: { type: Array, required: true, default: [] },
  nextExercise: { type: Boolean, required: true, default: true },
  exerciseSwitch: { type: Boolean, required: false }
});

UserSchema.index(
  { subject: 1, mail: 1, environment: 1 },
  {
    unique: true,
  }
);

module.exports = mongoose.model('User', UserSchema);
