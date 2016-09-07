"use strict";

const co = require('co');
const mongo = require('mongodb');
const MongoClient = mongo.MongoClient;
const ObjectId = mongo.ObjectID;

const devMode = process.env.DEV || false;
const config = require(`./config.json`)[devMode?'dev':'prod'];

const redis = require("redis"),
  client = redis.createClient(config.redis);

const Provider = require('./provider/data');
const Adviser = require('./adviser');
const adviser = new Adviser(new Provider(client));
const events = Object.keys(require('./event_types'));

let counter = 0;
let lastcount = 0;
let lastid = null;
const delay = 10000;

(function printtime() {
  const date = new Date();
  console.log(`${date.toLocaleTimeString()}: ${(counter - lastcount) / delay * 1000} docs/sec [${counter}, ${lastid}]`);
  lastcount = counter;
  setTimeout(printtime, delay)
})();

/**
 * @returns {Promise}
 */
function getLastId() {
  return new Promise((resolve, reject) => {
    client.get('lastEventDate', (err, reply) => err ? reject(err) : resolve(reply));
  }).then(microsec => new ObjectId(Math.floor((microsec || 9e11) / 1000).toString(16) + "0000000000000000"));
}


co(function*() {
  const id = yield getLastId();
  const db = yield MongoClient.connect("mongodb://136.243.12.83:27017/mob");
  const coll = db.collection("user_downloads");
  // const id = ObjectId('57b4e0c52c35ba012f8b6ff5');
  const cursor = coll
    .find({_id: {$gt: id/*, $lt: new ObjectId("56fc3b31c5ea522a1a8b458b")*/}, type: "android"})
    .skip(0)
    // .limit(1000000)
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