const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const ConfigSchema = new Schema({
    type: { type: String, required: true },
    url: { type: String, required: true },
});

ConfigSchema.index(
    { type: 1, url: 1 }, 
    {
        unique: true,
    }
);

module.exports = mongoose.model('Config', ConfigSchema);
