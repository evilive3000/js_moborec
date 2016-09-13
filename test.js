"use strict";

const devMode = process.env.DEV || false;
const config = require(`./config.json`)[devMode?'dev':'prod'];

const _ = require('lodash');

const client = require("redis").createClient(config.redis);

const Provider = require('./storage');
const provider = new Provider(client);

const Adviser = require('./adviser');
const adviser = new Adviser(provider);

provider.getEvents(123333123).then(x => console.log(x));