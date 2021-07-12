const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const ValidationSchema = new Schema({
    input: { type: String},
    solution: { type: String}
  });

module.exports = mongoose.model("Validation", ValidationSchema);
