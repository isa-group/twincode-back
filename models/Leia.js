const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const LeiaSchema = new Schema({
    code: { type: String, required: true },
    subject: { type: String, ref: 'Session', required: true },
    type: { type: String, ref: 'Config', required: true },
});

LeiaSchema.index(
    { code: 1 },
    {
        unique: true,
    }
);

module.exports = mongoose.model('Leia', LeiaSchema);