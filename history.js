"use strict";

const _ = require('lodash');
const events = require('./event_types');

const radius = {
  limit: 7,
  age: 30 * 24 * 60 * 60 * 1000
};

function shouldReplaceEvent(oldEvent, newEvent) {
  const [N, O] = [newEvent[2], oldEvent[2]];
  if (O === N) return false;
  return O === 'download' || N !== 'download';
}

function pairId(eventA, eventB) {
  const [a, b] = [eventA[1], eventB[1]];
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function pairVal(eA, eB, eOld) {
  const vOld = _.isNull(eOld) ? 0 : events[eOld[2]];
  return events[eA[2]] * (events[eB[2]] - vOld);
}

function itemVal(e, eOld) {
  const vOld = _.isNull(eOld) ? 0 : Math.pow(events[eOld[2]], 2);
  return Math.pow(events[e[2]], 2) - vOld;
}


class History {

  constructor(user, events = []) {
    this.user = user;
    this.events = events;
    this.index = events.reduce((prev, curr, i) => Object.assign(prev, {[curr[1]]: i}), {});
  }

  /**
   *
   * @param evObj
   * @returns {{}}
   */
  add(evObj) {
    let i = evObj[1] in this.index ? this.index[evObj[1]] : false, result = {};
    if (false === i || shouldReplaceEvent(this.events[i], evObj)) {
      const {old, index} = this._setEvent(evObj, i);
      const interact = this.getInteracted(index);
      const pairsDelta = interact.map(eA => [pairId(eA, evObj), pairVal(eA, evObj, old)]);
      const itemDelta = itemVal(evObj, old);
      result.delta = {pairs: pairsDelta, item: [evObj[1], itemDelta]};
      result.update = {
        user: this.user,
        evObj: this.events[index],
        index: old ? index : false
      };
    }
    return result;
  }

  /**
   *
   * @param evObj
   * @param index
   * @returns {*}
   */
  _setEvent(evObj, index) {
    if (index === false) {
      this.events.push(evObj);
      index = this.index[evObj[1]] = this.events.length - 1;
      return {old: null, index}
    } else {
      const old = Object.assign({}, this.events[index]);
      this.events[index][2] = evObj[2];
      return {old, index}
    }
  }

  /**
   *
   * @returns {boolean}
   */
  overflowed() {
    return this.events.length >= 500;
  }

  /**
   *
   * @param index
   * @returns {Array.<*>}
   */
  getInteracted(index) {
    let interact = [[], []], i = index;
    const eventDate = this.events[index][0].getTime();
    const minDate = eventDate - radius.age;
    const maxDate = eventDate + radius.age;

    while (interact[0].length < radius.limit && i-- && this.events[i][0] > minDate) {
      interact[0].push(this.events[i]);
    }

    i = index;
    while (interact[1].length < radius.limit && this.events.length > ++i && this.events[i][0] < maxDate) {
      interact[1].push(this.events[i]);
    }

    return [].concat(interact[0], interact[1]);
  }
}

module.exports = History;

