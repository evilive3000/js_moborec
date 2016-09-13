"use strict";

const co = require('co');
const mongo = require('mongodb');
const MongoClient = mongo.MongoClient;
// const ObjectId = mongo.ObjectID;

const devMode = process.env.DEV || false;
const config = require(`./config.json`)[devMode ? 'dev' : 'prod'];

const redis = require("redis"),
  client = redis.createClient(config.redis);

const Storage = require('./storage');
const storage = new Storage(client);

const Adviser = require('./adviser');
const adviser = new Adviser(storage);

let counter = 0;
let lastcount = 0;
let lastid = null;
const delay = 10000;

(function printtime() {
  const date = new Date();
  console.log(`${date.toLocaleTimeString()}: ${(counter - lastcount) / delay * 1000} docs/sec [${counter}, ${lastid}]`);
  adviser.getStats().then(stats => console.log(stats));
  lastcount = counter;
  setTimeout(printtime, delay)
})();

co(function*() {
  yield (new Promise(res => {
    const seconds = 5;
    console.log(`База редиса будет почищена через ${seconds} секунд`);
    setTimeout(() => {
      client.flushdb(res);
    }, seconds * 1000);
  })).catch(e => console.log(e));

  yield storage.init();

  const db = yield MongoClient.connect("mongodb://136.243.12.83:27017/mob");
  const coll = db.collection("user_downloads");
  const cursor = coll
    .find({type: "android"})
    .skip(1000000)
    .limit(0)
    .sort({_id: 1});

  // Iterate over the cursor
  while (yield cursor.hasNext()) {
    counter++;
    const doc = yield cursor.next();
    const user = doc.uid.toString();
    const item = doc.gid;
    const type = typeof doc.vote === 'undefined' ? 'download' : (doc.vote ? 'vote_up' : 'vote_down');
    lastid = doc._id.toString();
    const date = new Date(parseInt(lastid.substring(0, 8), 16) * 1000);
    yield adviser.addEvent(user, item, type, date);
  }

  yield db.close();
}).catch(e => console.log(e));