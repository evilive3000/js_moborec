"use strict";

const CacheProvider = require('./cache');
const CacheLRU = require('cache-lru');
const co = require('co');
const _ = require('lodash');
const events = require('./../event_types');
const eventIndex = {};
let index = 1;
for (let key in events) {
  eventIndex[eventIndex[key] = index++] = key;
}

const cache = new CacheLRU();
cache.limit(50000);

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

// /**
//  *
//  * @param a
//  * @param b
//  * @param ab
//  * @returns {*}
//  */
// function sim(a, b, ab) {
//   if (_.isNull(a) || _.isNull(b))
//     return null;
//   return ab / Math.sqrt(a * b);
// }

class DataProvider {
  constructor(redisClient) {
    this.redis = redisClient;
    this.cache = new CacheProvider(redisClient);
  }

  /**
   *
   */
  start() {
    return this.cache.init();
  }

  /**
   *
   * @param user
   * @returns {Promise.<*>}
   */
  getEvents(user) {
    const events = cache.get(user);
    if (events) {
      return Promise.resolve(events);
    }

    return new Promise((resolve, reject) => {
      this.redis.lrange(new Buffer(`u:${user}`), 0, -1, promisify(resolve, reject))
    }).then(list => {
      const events = list.map(unserialize);
      cache.set(user, events);
      return events;
    });
  }

  /**
   *
   * @param {{pairs: Array, item: number}} delta
   * @returns {Promise}
   */
  increment(delta) {
    this.cache.increment(delta);
  }

  getSimilar(item, threshold, limit) {
    return this.cache.getSimilar(item, threshold, limit);
  }

  getRecomlist(user, limit) {
    return Promise.resolve([]);
    // const provider = this;
    // return co(function*() {
    //
    //   const story = _.keyBy(yield provider.getEvents(user), 1);
    //   const without = new Set(_.map(story, 1));
    //
    //   // не учтен личный опыт пользователя
    //   // надо учитывает проставленный рейтинг
    //   const sims = {};
    //   for (const id of without) {
    //     if (provider.cache.items[id]) {
    //       const r = provider.cache.items[id].r;
    //       let i = r.length;
    //       while (i-- && r[i][1] > 0.009) {
    //         const [g, sim] = r[i];
    //         sims[g] = sims[g] ? [g, Math.max(sims[g][1], sim)] : [g, sim];
    //       }
    //     }
    //   }
    //
    //   return _(sims)
    //     .orderBy(1, 'desc')
    //     .take(limit)
    //     .value();
    //
    // }).catch(e => console.log(e))
  }

  /**
   *
   * @param user
   * @param index
   * @param event
   * @returns {Promise}
   */
  setEvent(user, event, index) {
    const method = _.isNumber(index) ? 'LSET' : 'LPUSH';
    const params = [];
    params.push(`u:${user}`);
    method == 'LSET' && params.push(index);
    params.push(serialize(event));
    this.cache.historyCommands.push([method, ...params]);
    this.cache.lastEventDate = event[0];
  }

  histo() {
    return this.cache.histo();
  }

  cacheStats() {
    return {lru: cache.length()}
  }
}

module.exports = DataProvider;