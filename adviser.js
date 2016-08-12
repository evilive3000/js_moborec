const co = require('co');
const _ = require('lodash');
const events = require('./event_types');

function pairId(eventA, eventB) {
  const [a, b] = [eventA[1], eventB[1]];
  return a < b ? `${a}:${b}` : `${b}:${a}`;
  // return a < b ? [a, b] : [b, a];
}

function pairVal(eventA, eventB) {
  return events[eventA[2]] * events[eventB[2]];
}

function itemVal(eventA) {
  return events[eventA[2]] * events[eventA[2]];
}

class Adviser {
  /**
   *
   * @param {DataProvider} provider
   */
  constructor(provider) {
    this.storage = provider;
    this.counter = 0;
  }

  /**
   *
   * @param user
   * @param item
   * @param type
   * @param date
   * @returns {*}
   */
  addEvent(user, item, type, date) {
    this.counter++;
    const storage = this.storage;
    date || (date = new Date());
    return co(function*() {
      const events = yield storage.getEvents(user);
      const history = new History(storage, user, events);
      const delta = history.add([date, item, type]);
      storage.increment(delta);
    });
  }
}

/**
 *
 */
class History {
  constructor(storage, user, events) {
    this.storage = storage;
    this.user = user;
    this.events = events || [];
    this.radius = {
      limit: 5,
      age: 7 * 24 * 60 * 60 * 1000
    }
  }

  add(event) {
    const evs = this.events;
    let index = _.findLastIndex(evs, {1: event[1]});
    let oldEvent = evs[index] && (evs[index][1] == event[1]) ? _.clone(evs[index]) : null;

    if (oldEvent) {
      if (!this.shouldReplaceEvent(oldEvent, event)) return [];
      evs[index][2] = event[2];
      event[0] = evs[index][0];
      this.storage.setEvent(this.user, index, event);
    } else {
      evs.push(event);
      index = evs.length - 1;
      this.storage.pushEvent(this.user, event);
    }

    const interact = this.getInteracted(index);
    const pairsDelta = interact.map(e => [pairId(e, event), pairVal(e, event)]);
    const itemDelta = itemVal(event) - (oldEvent ? itemVal(oldEvent) : 0);

    return {pairs: pairsDelta, item: [event[1], itemDelta]}
  }

  /**
   *
   * @param newEvent
   * @param oldEvent
   */
  shouldReplaceEvent(oldEvent, newEvent) {
    const [N, O] = [newEvent[2], oldEvent[2]];
    if (O === N) return false;
    return O === 'download' || N !== 'download';
  }

  /**
   *
   * @param index
   * @returns {Array.<*>}
   */
  getInteracted(index) {
    let interact = [[], []], i = index;
    const {age, limit} = this.radius;
    const evs = this.events;
    const eventDate = evs[index][0].getTime();
    const minDate = eventDate - age;
    const maxDate = eventDate + age;

    while (interact[0].length < limit && i-- && evs[i][0] > minDate) {
      interact[0].push(evs[i]);
    }
    i = index;
    while (interact[1].length < limit && evs.length > ++i && evs[i][0] < maxDate) {
      interact[1].push(evs[i]);
    }

    return [].concat(interact[0], interact[1]);
  }
}

module.exports = Adviser;