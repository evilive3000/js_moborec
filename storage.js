"use strict";

const _ = require('lodash');
const co = require('co');

const devMode = process.env.DEV || false;
const config = require(`./config.json`)[devMode ? 'dev' : 'prod'];

const events = require('./event_types');
const eventIndex = {};
let index = 1;
for (let key in events) {
  eventIndex[eventIndex[key] = index++] = key;
}

let eventUpdates = [];
let incrBy = {};
const items = {};
const MIN_VECTOR_LENGTH = 10;
const MIN_SIMILARITY = 0.005;

const PERSIST_DELAY = 15000;

function sim(a, b, ab) {
  if (_.isNull(a) || _.isNull(b))
    return null;
  return ab / Math.sqrt(a * b);
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

/**
 *
 * @param redis
 * @returns {Promise.<T>}
 */
function persist(redis) {
  const datestr = (new Date).toLocaleTimeString();
  console.log(`:::::${datestr} persist: {commands:${eventUpdates.length}, incrby: ${_.size(incrBy)}}`);

  const commands = eventUpdates.concat(_.map(incrBy, (val, key) => ['INCRBY', `c:${key}`, val]));
  const ids = _.keys(incrBy);
  eventUpdates = [];
  incrBy = {};

  // validate(redis);

  if (commands.length == 0) {
    return _.delay(persist, PERSIST_DELAY, redis);
  }

  new Promise((resolve, reject) => redis.batch(commands).exec(promisify(resolve, reject)))
    .then(() => updateRecommendations(redis, ids))
    .then(() => _.delay(persist, PERSIST_DELAY, redis))
    .catch(e => console.log(e));
}

/**
 *
 * @param redis
 * @param ids
 * @returns {Promise}
 */
function updateRecommendations(redis, ids) {
  return new Promise((resolve, reject) => {
    redis.mget(ids.map(k => `c:${k}`), promisify(resolve, reject));
  }).then(vals => {
      const data = _.zipObject(ids, vals);
      const commands = [];
      for (const pair of ids) {
        const [a, b] = pair.split(':');
        if (_.isUndefined(b)) continue; // счетчик игры, а не пары.

        if (!items[a] || !items[b]) {
          console.log('===001===');
          console.log(items[a], items[b]);
          process.exit();
        }

        if (data[pair] > MIN_VECTOR_LENGTH) {
          const ca = data[a] || items[a].c;
          const cb = data[b] || items[b].c;
          const simi = sim(ca, cb, data[pair]);
          Array.prototype.push.apply(commands, scoreUpdate(a, b, simi));
        }
      }

      return new Promise((resolve, reject) => redis.batch(commands).exec(promisify(resolve, reject)))
    }
  )
}

/**
 *
 * @param A
 * @param B
 * @param sim
 * @returns {Array}
 */
function scoreUpdate(A, B, sim) {
  const update = [];
  if (!sim) return update;

  for (let [a, b] of [[A, B], [B, A]]) {
    let index = _.findIndex(items[a].r, {0: b});
    index > -1 && _.pullAt(items[a].r, index);

    if (sim >= MIN_SIMILARITY) {
      index = _.sortedIndexBy(items[a].r, [b, sim], 1);
      items[a].r.splice(index, 0, [b, sim]);
      update.push(['ZADD', `r:${a}`, sim, b]);
    } else {
      update.push(['ZREM', `r:${a}`, b]);
    }
  }
  return update;
}

// function validate(redis) {
//   return new Promise((resolve, reject) => {
//     const ids = _.reduce(items, (prev, curr, id) => Object.assign(prev, {[id]: curr.c}), {});
//
//     redis.mget(_.keys(ids).map(id => `c:${id}`), function (err, result) {
//       const data = _.zipObject(_.keys(ids), result);
//       console.log('====================');
//       for (const id of _.keys(ids)) {
//         if (ids[id] - data[id] != 0) {
//           console.log(id, ids[id], data[id]);
//         }
//       }
//       console.log('--------------------');
//     });
//   });
// }

class Storage {
  constructor(redis) {
    this.redis = redis;
  }

  init() {
    const self = this;
    return co(function*() {
      const ids = _.range(1, 25000);
      const [scores, counts] = yield [self.loadRatings(ids), self.loadCounts(ids)];
      for (let i = 0; i < ids.length; i++) {
        const doc = {
          r: _.chunk(scores[i].map(parseFloat), 2),
          c: parseInt(counts[i] || 0, 10)
        };
        if (doc.r.length > 0 || doc.c != 0) {
          items[ids[i]] = doc;
        }
      }
      persist(self.redis);
    });
  }

  /**
   * Истории пользователей кэшируются в lru кэше this.lruCache
   *
   * @param user
   * @returns {*}
   */
  getEvents(user) {
    return new Promise((resolve, reject) => {
      this.redis.lrange(new Buffer(`u:${user}`), 0, -1, promisify(resolve, reject))
    }).then(list => list.map(unserialize));
  }

  /**
   *
   * @param item
   * @param limit
   * @returns {Promise.<Array.<*>>}
   */
  getSimilar(item, limit) {
    limit || (limit = 999999);
    const list = (items[item] || {r: [], c: 0}).r;
    return Promise.resolve(_.takeRight(list, limit).reverse());
  }

  /**
   *
   * @param delta
   * @param update
   */
  update({delta, update}) {
    if (delta) {
      this.increment(delta);
    }

    if (update) {
      const {user, evObj, index} = update;
      const method = index === false ? 'LPUSH' : 'LSET';
      const params = [];
      params.push(`u:${user}`);
      method == 'LSET' && params.push(index);
      params.push(serialize(evObj));
      eventUpdates.push([method, ...params]);
    }
  }

  /**
   *
   * @param pairs
   * @param item
   */
  increment({pairs, item}) {
    for (const [pair, val] of pairs || []) {
      incrBy[pair] = val + (incrBy[pair] || 0)
    }

    if (item) {
      const [id, val] = item;
      incrBy[id] = val + (incrBy[id] || 0);

      if (id in items) {
        items[id].c += val;
      } else {
        items[id] = {r: [], c: val}
      }
    }
  }

  /**
   *
   * @returns {{base: number, vals}}
   */
  histo() {
    const base = Math.sqrt(10);
    return {
      base,
      vals: _.countBy(items, d => {
        const l = d.r.length;
        return l > 0 ? Math.ceil(Math.log(l) / Math.log(base)) : -1;
      })
    };
  }

  /**
   *
   * @param ids
   * @returns {Promise}
   */
  loadRatings(ids) {
    return new Promise((resolve, reject) => {
      this.redis
        .batch(ids.map(i => ['ZRANGE', 'r:' + i, 0, -1, 'WITHSCORES']))
        .exec(promisify(resolve, reject));
    });
  }

  /**
   *
   * @param ids
   * @returns {Promise}
   */
  loadCounts(ids) {
    return _.isEmpty(ids)
      ? Promise.resolve([])
      : new Promise((s, j) => this.redis.mget(ids.map(i => 'c:' + i), promisify(s, j)));
  }
}

module.exports = Storage;