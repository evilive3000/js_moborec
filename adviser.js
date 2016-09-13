"use strict";

const devMode = process.env.DEV || false;
const config = require(`./config.json`)[devMode ? 'dev' : 'prod'];

const co = require('co');
const History = require('./history');

const CacheLRU = require('cache-lru');
const lruCache = new CacheLRU();
lruCache.limit(config.cache.lenLRU);

class Adviser {
  /**
   *
   * @param {Storage} storage
   */
  constructor(storage) {
    this.storage = storage;
    this.counter = {
      events: 0,
      recomitem: 0,
      recomlist: 0,
      cachehit: 0,
      cachemiss: 0
    };
  }

  /**
   * Рекомендации для игры
   *
   * @param item
   * @param limit
   * @returns {*}
   */
  recomByItem(item, limit) {
    this.counter.recomitem++;
    return this.storage.getSimilar(item, limit)
  }

  /**
   * Рекомендации для списка игр
   *
   * @param uid
   * @param limit
   * @returns {*}
   */
  recomByList(uid, limit) {
    this.counter.recomlist++;
    const adviser = this;
    return co(function*() {
      const history = yield adviser.getHistory(uid);
      const sims = yield history.map(d => adviser.recomByItem(d[1], limit));
      //!!!!!!!!!!!!!!!!!!!!!!!!!!!
      return sims;
      //!!!!!!!!!!!!!!!!!!!!!!!!!!!
    })
  }

  /**
   * Зарегистрировать новое событие
   *
   * @param user
   * @param item
   * @param type
   * @param date
   * @returns {*}
   */
  addEvent(user, item, type, date) {
    const adviser = this;
    date || (date = new Date());
    return co(function*() {
      const history = yield adviser.getHistory(user);
      if (!history.overflowed()) {
        const result = history.add([date, item, type]);
        adviser.storage.update(result);
        adviser.counter.events++
      }
    })
  }

  /**
   * Статистика сервера
   */
  getStats() {
    return Promise.resolve({
      memory: process.memoryUsage(),
      histo: this.storage.histo(),
      counter: this.counter
    })
  }

  /**
   *
   * @param user
   * @returns Promise
   */
  getHistory(user) {
    const history = lruCache.get(user);
    if (history) {
      this.counter.cachehit++;
      return Promise.resolve(history)
    }
    this.counter.cachemiss++;

    const storage = this.storage;
    return co(function*() {
      const events = yield storage.getEvents(user);
      const history = new History(user, events);
      lruCache.set(user, history);
      return history
    })
  }
}

module.exports = Adviser;


// getRecomlist(user, limit) {
//   return Promise.resolve([]);
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
// }