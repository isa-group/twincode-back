const mongoose = require("mongoose");
const Schema = mongoose.Schema;
var Validation = require('../models/Validation.js').schema;

const ExerciseSchema = new Schema({
    name: { type: String, required: true },
    description: { type: String, required: true },
    validations: { type: [Validation]},
    time: { type: Number },
    type: { type: String}
  });

module.exports = mongoose.model("Exercise", ExerciseSchema);
