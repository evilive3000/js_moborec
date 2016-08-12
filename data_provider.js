"use strict";

const _ = require('lodash');
const events = require('./event_types');
const eventIndex = {};
let index = 1;
for (let key in events) {
  eventIndex[eventIndex[key] = index++] = key;
}

/**
 *
 * @param resolve
 * @param reject
 * @returns {function(): *}
 */
function promisify(resolve, reject) {
  return (err, reply) => err ? reject(err) : resolve(reply);
}

/**
 *
 * @param event
 */
function serialize(event) {
  const buf = Buffer.allocUnsafe(7);
  const mills = Math.round(event[0].getTime() / 1000);

  buf.writeUInt32BE(mills, 0);
  buf.writeUInt16BE(event[1], 4);
  buf.writeUInt8(eventIndex[event[2]], 6);
  return buf;
}

/**
 *
 * @param str
 * @returns {*[]}
 */
function unserialize(str) {
  const mills = str.readUInt32BE(0) * 1000;
  return [
    new Date(mills),
    str.readUInt16BE(4),
    eventIndex[str.readUInt8(6)]
  ];
}


class DataProvider {
  constructor(redisClient) {
    this.redis = redisClient;
    this.updateQueue = new Set();
    const storage = this;

    const delay = 1000;
    (function run() {
      if (storage.updateQueue.size >= 1) {
        console.log(`Process queue: ${storage.updateQueue.size}`);
        storage._processQueue(() => setTimeout(run, delay));
      } else {
        _.delay(run, delay);
      }
    })();
  }

  /**
   *
   * @param user
   * @returns {Promise.<*>}
   */
  getEvents(user) {
    const redis = this.redis;
    return new Promise((resolve, reject) => {
      redis.lrange(new Buffer(`u:${user}`), 0, -1, promisify(resolve, reject))
    }).then(list => list.map(unserialize));
  }

  /**
   *
   * @param {{pairs: Array, item: number}} delta
   * @returns {Promise}
   */
  increment(delta) {
    const provider = this;
    return new Promise((resolve, reject) => {
      if (Object.keys(delta).length == 0) return resolve();
      const commands = delta.pairs.map(val => ['INCRBY', ...val]);

      commands.push(['INCRBY', ...delta.item]);
      // обновляем пачку пар для которых надо будет пересчитать топы.
      delta.pairs.forEach(v => provider.updateQueue.add(v[0]));
      /** *************************** **/
      // provider._processQueue();
      /** *************************** **/
      provider.redis.batch(commands).exec(promisify(resolve, reject));

    });
  }

  /**
   *
   * @param user
   * @param event
   * @returns {Promise}
   */
  pushEvent(user, event) {
    const redis = this.redis;
    return new Promise((resolve, reject) => {
      redis.lpush(`u:${user}`, serialize(event), promisify(resolve, reject))
    })
  }

  /**
   *
   * @param user
   * @param index
   * @param event
   * @returns {Promise}
   */
  setEvent(user, index, event) {
    const redis = this.redis;
    return new Promise((resolve, reject) => {
      redis.lset(
        `u:${user}`,
        index,
        serialize(event),
        promisify(resolve, reject)
      )
    })
  }

  /**
   *
   * @private
   */
  _processQueue(callback) {
    const redis = this.redis;
    let keys = new Set();
    const pairs = new Set(this.updateQueue);
    this.updateQueue.clear();

    for (const pair of pairs.values()) {
      [pair].concat(pair.split(':')).forEach(p => keys.add(p));
    }

    keys = Array.from(keys);
    redis.mget(keys, (err, vals) => {
      const data = _.zipObject(keys, vals);
      const commands = [];

      for (const pair of pairs.values()) {
        const [a, b] = pair.split(':');
        const simi = sim(data[a], data[b], data[pair]);
        if (simi) {
          commands.push(['ZADD', `r:${a}`, simi, b]);
          commands.push(['ZADD', `r:${b}`, simi, a]);
        }
      }

      redis.batch(commands).exec(callback);
    });
  }
}

/**
 *
 * @param a
 * @param b
 * @param ab
 * @returns {*}
 */
function sim(a, b, ab) {
  if (_.isNull(a) || _.isNull(b))
    return null;
  return ab / Math.sqrt(a * b);
}

module.exports = DataProvider;