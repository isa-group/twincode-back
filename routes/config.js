require("dotenv").config();
var express = require("express");
const router = express.Router();
const Config = require("../models/Config");
const Logger = require("../logger.js");
const { faker } = require("@faker-js/faker");

faker.seed(new Date().getTime());

router.post("/leia/config", async (req, res) => {
    const adminSecret = req.headers.authorization;

    if (adminSecret === process.env.ADMIN_SECRET) {
        try {
            var config = new Config();
            config.type = req.body.type;
            config.url = req.body.url;

            const createdConfig = await config.save();
            Logger.dbg("ADD CONFIG - Leia config created: " + createdConfig);

            res.status(201).send(createdConfig);
        } catch (e) {
            console.log(e);
            res.sendStatus(500);
        }
    } else {
        res.sendStatus(401);
    }
})

router.get("/leia/config", async (req, res) => {
    const adminSecret = req.headers.authorization;

    if (adminSecret === process.env.ADMIN_SECRET) {
        try {
            const config = await Config.find();
            res.status(200).send(config);
        } catch (err) {
            console.log(err);
            res.sendStatus(500);
        }
    }
})

module.exports = router;