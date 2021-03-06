"use strict";

const Ajv = require('ajv');
const events = require('./event_types');

// http://json-schema.org/example2.html
const post_event = {
  "properties": {
    "uid": {"type": "string"},
    "oid": {"type": "integer", "minimum": 1},
    "event": {"enum": Object.keys(events)}
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

const get_recomlist = {
  "properties": {
    "uid": {
      "description": "Id листа (пользователя) для которого надо построить рекомендации на основе списка",
      "type": "string",
      "pattern": "[a-fA-F0-9]{24}"
    }
  },
  "required": ["uid"],
  "additionalProperties": false
};

/**
 *
 * @type {Ajv}
 */
const validator = new Ajv({});
validator.addSchema(post_event, 'post_event');
validator.addSchema(get_recom, 'get_recom');
validator.addSchema(get_recomlist, 'get_recomlist');

module.exports = {schemas: {post_event, get_recom, get_recomlist}, validator};