"use strict";

const _ = require('lodash');

const events = require('./event_types');
const eventIndex = {};
let index = 1;
for (const key of _.keys(events)) {
  eventIndex[eventIndex[key] = index++] = key;
}

/**
 *
 * @param {Number} a
 * @param {Number} b
 * @param {Number} ab
 * @returns {Number}
 */
function sim(a, b, ab) {
  return (null === a || null === b) ? null : ab / Math.sqrt(a * b);
}

/**
 *
 * @param {Function} resolve
 * @param {Function} reject
 * @returns {function(): *}
 */
function promisify(resolve, reject) {
  return (err, reply) => err ? reject(err) : resolve(reply);
}

/**
 *
 * @param {Array} event
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

module.exports = {sim, promisify, serialize, unserialize}