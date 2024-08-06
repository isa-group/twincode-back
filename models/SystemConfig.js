require("dotenv").config();
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

languages = process.env.LANGUAGES ? process.env.LANGUAGES.split(",") : ["en"];

const SystemConfigSchema = new Schema({
    modified: { type: Date, default: Date.now },
    languaje: { 
        type: String, 
        enum: languages,
        default: "en",
        required: true
    },
    environment: {
        type: String,
        required: true,
        unique: true
    }
});

SystemConfigSchema.index({ environment: 1 }, { unique: true });

const SystemConfig = mongoose.model("SystemConfig", SystemConfigSchema);

async function initializeSystemConfig() {
    try {
      const config = await SystemConfig.findOne();
      if (!config) {
        const defaultConfig = new SystemConfig({
          environment: process.env.NODE_ENV || "development",
          languaje: "en"
        });
        await defaultConfig.save();
        console.log("System Configuration initialized.");
      } else {
        console.log("System Configuration found.");
      }
    } catch (error) {
      console.error("Error initializing System Configuration: ", error);
    }
  }
  
  module.exports = { SystemConfig, initializeSystemConfig };