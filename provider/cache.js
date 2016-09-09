"use strict";

const co = require('co');
const _ = require('lodash');

function promisify(resolve, reject) {
  return (err, reply) => err ? reject(err) : resolve(reply);
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

class CacheProvider {
  constructor(redisClient) {
    this.items = {};
    this.redis = redisClient;
    this.historyCommands = [];
    this.incrby = {};
    // минимальное количество пар для того чтобы начать считать статитсику для этих игр
    this.threashold = 10;
    this.lastPersist = Date.now();
  }

  /**
   *
   * @returns {Promise}
   */
  init() {
    const items = this.items = {};
    const provider = this;

    return co(function*() {
      const ids = _.range(1, 25000);
      const [scores, counts] = yield [provider.loadRatings(ids), provider.loadCounts(ids)];

      for (let i = 0; i < ids.length; i++) {
        const doc = {
          r: _.chunk(scores[i].map(parseFloat), 2),
          c: parseInt(counts[i] || 0, 10)
        };
        if (doc.r.length > 0 || doc.c != 0) {
          items[ids[i]] = doc;
        }
      }

      return provider;
    });
  }

  increment(delta) {
    for (const [pair, val] of delta.pairs || []) {
      (pair in this.incrby) || (this.incrby[pair] = 0);
      this.incrby[pair] += val;
    }

    if (delta.item) {
      const [item, inc] = delta.item;
      if (!(item in this.items)) {
        this.items[item] = {r: [], c: 0}
      }
      this.items[item].c += inc;
      this.incrby[item] = inc + (this.incrby[item] || 0);
    }
    this.isTimeToPersist() && this.persist();
  }

  getSimilar(item, threshold, limit) {
    threshold || (threshold = 0.001);
    limit || (limit = 999999);
    const data = this.items[item] || {r: [], c: 0};
    let count = data.r.length;
    const result = [];
    while (count-- && data.r[count][1] > threshold && limit--) {
      result.push(data.r[count]);
    }
    return Promise.resolve(result);
  }

  /**
   *
   * @param A
   * @param B
   * @param sim
   */
  scoreUpdate(A, B, sim) {
    for (let [a, b] of [[A, B], [B, A]]) {
      const data = this.items[a] /* || (this.items[a] = {r: [], c: 0})*/;
      let index = _.findIndex(data.r, {0: b});
      index > -1 && _.pullAt(data.r, index);
      index = _.sortedIndexBy(data.r, [b, sim], 1);
      data.r.splice(index, 0, [b, sim]);
    }
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
      : new Promise((resolve, reject) => this.redis.mget(ids.map(i => 'c:' + i), promisify(resolve, reject)));
  }

  /**
   *
   * @returns {{base: number, vals}}
   */
  histo() {
    const base = Math.sqrt(10);
    return {
      base,
      vals: _.countBy(this.items, d => {
        const l = d.r.length;
        return l > 0 ? Math.ceil(Math.log(l) / Math.log(base)) : -1;
      })
    };
  }

  /**
   * @returns {boolean}
   */
  isTimeToPersist() {
    return ((Date.now() - this.lastPersist) > 30 * 1000) || (this.historyCommands.length > 5000);
  }

  /**
   *
   * @returns {Promise}
   */
  persist() {
    if (this.persisting)
      return this.persisting;

    this.lastPersist = new Date;
    const {historyCommands, incrby} = this;
    this.historyCommands = [];
    this.incrby = {};

    const commands = [].concat(
      historyCommands,
      _.map(incrby, (val, key) => ['INCRBY', `c:${key}`, val])
    );

    if (commands.length == 0) {
      delete this.persisting;
      return Promise.resolve();
    }
    
    const datestr = (new Date).toLocaleTimeString();
    console.log(`${datestr} persist: {commands:${historyCommands.length}, incrby: ${_.size(incrby)}}`);

    return this.persisting = new Promise((resolve, reject) => {
      this.redis.batch(commands).exec(promisify(resolve, reject));
    }).then(() => this.updateRecommendations(_.keys(incrby)))
      .then(() => delete this.persisting, () => delete this.persisting);
  }

  /**
   *
   * @param keys
   * @returns {Promise}
   */
  updateRecommendations(keys) {
    return new Promise((resolve, reject) => {
      this.redis.mget(keys.map(k => `c:${k}`), promisify(resolve, reject));
    }).then(vals => {
      const data = _.zipObject(keys, vals);
      const commands = [];
      const items = this.items;

      for (const pair of keys) {
        const [a, b] = pair.split(':');
        if (_.isUndefined(b)) continue;

        if (data[pair] > this.threashold) {
          const ca = data[a] || items[a].c;
          const cb = data[b] || items[b].c;
          const simi = sim(ca, cb, data[pair]);
          if (simi) {
            commands.push(['ZADD', `r:${a}`, simi, b]);
            commands.push(['ZADD', `r:${b}`, simi, a]);
            this.scoreUpdate(a, b, simi);
          }
        }
      }

      return new Promise((resolve, reject) => {
        this.redis.batch(commands).exec(promisify(resolve, reject));
      });
    });
  }
}

module.exports = CacheProvider;