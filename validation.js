"use strict";

const Ajv = require('ajv');
const Adviser = require('./adviser');

// http://json-schema.org/example2.html
const post_event = {
  "properties": {
    "uid": {"type": "string"},
    "oid": {"type": "integer", "minimum": 1},
    "event": {"enum": Object.keys((new Adviser()).events)}
  },
  "required": ["uid", "oid", "event"],
  "additionalProperties": false
};

const get_recom = {
  "properties": {
    "oid": {
      "description": "Id объекта (игры) к которому нужно получить рекомендации",
      "type": "integer",
      "minimum": 1
    }
  },
  "required": ["oid"],
  "additionalProperties": false
};

/**
 *
 * @type {Ajv}
 */
const validator = new Ajv({});
validator.addSchema(post_event, 'post_event');
validator.addSchema(get_recom, 'get_recom');

module.exports = {schemas: {post_event, get_recom}, validator};