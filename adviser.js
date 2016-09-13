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