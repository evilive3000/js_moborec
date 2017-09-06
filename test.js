"use strict";

const devMode = process.env.DEV || false;
const config = require(`./config.json`)[devMode ? 'dev' : 'prod'];

const _ = require('lodash');

const client = require("redis").createClient(config.redis);

const Provider = require('./storage');
const provider = new Provider(client);

const Adviser = require('./adviser');
const adviser = new Adviser(provider);

const date = new Date;
const user = "57640fe92c35bade068b457z";


Promise.all([
  adviser.addEvent(user, 1445, "download", date),
  adviser.addEvent(user, 1445, "vote_up", date)])
  .then(() => adviser.getHistory(user))
  .then(history => console.log(history));

