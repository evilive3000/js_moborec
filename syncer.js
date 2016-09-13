"use strict";

const co = require('co');

const ObjectId = require('mongodb').ObjectID;

/**
 *
 * @param {RedisClient} redis
 * @returns {Promise}
 */
function lastId(redis) {
  return new Promise((res, rej) => {
    redis.get('lastEventId', (err, lastId) => err ? rej(err) : res(lastId))
  })
}

/**
 *
 * @param {RedisClient} redis
 * @param {Db} mongodb
 * @param {Storage} storage
 * @returns {*|Promise}
 */
function sync(redis, mongodb, storage) {
  return co(function*() {
    yield storage.init();

    const id = yield lastId(redis);
    const coll = mongodb.collection("user_downloads");
    const cursor = coll
      .find({
        _id: {
          $gt: id ? ObjectId(id) : null,
          type: "android"
        }
      })
      .skip(1000000)
      .limit(0)
      // .sort({_id: 1})
      .addCursorFlag(); // синькер не проканает так как ключ tailable работает только с capped коллекциями.

    return 'hello world';
  })

}

module.exports = sync;