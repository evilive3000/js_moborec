"use strict";

const validator = require('./validation').validator;

var client = require("redis").createClient({
  host: "redis",
  db: 4,
  detect_buffers: true
  // prefix: "recom-"
});

const Provider = require('./provider/data');
const provider = new Provider(client);

const Adviser = require('./adviser');
const adviser = new Adviser(provider);

const eventtypes = require('./event_types');

const restify = require('restify');
const server = restify.createServer({});

server.use(restify.bodyParser());

/**
 * Статистика
 */
server.get('/stats', (req, res, next) => {
  adviser.getStats().then(stats => {
    res.send(stats);
    next();
  });
});

/**
 * Список событий которые понимает система
 */
server.get('/events', (req, res, next) => {
  res.send(eventtypes);
  next();
});

/**
 * Получить список рекомендаций
 */
server.get('/recom/:oid', (req, res, next) => {
  req.params.oid && (req.params.oid = parseInt(req.params.oid, 10));
  if (!validator.validate('get_recom', req.params)) {
    return next(new restify.UnprocessableEntityError(validator.errorsText()));
  }
  adviser
    .recomByItem(req.params.oid, 0.001, 20)
    .then(result => {
      res.send(result);
      next();
    });
});

server.get('/recomlist/:uid', (req, res, next) => {
  if (!validator.validate('get_recomlist', req.params)) {
    return next(new restify.UnprocessableEntityError(validator.errorsText()));
  }
  // adviser.recomByUserlist(req.params.uid, 20)
  //   .then(result => {
  //     res.send(result);
  //     next();
  //   });
  res.send([]);
  next();
});

/**
 * Добавление события
 */
server.post('/event', (req, res, next) => {
  if (!validator.validate('post_event', req.params)) {
    return next(new restify.UnprocessableEntityError(validator.errorsText()));
  }
  const {uid, oid, event} = req.params;
  adviser.addEvent(uid, oid, event).catch(err => console.log(err));
  res.send("OK");
  next();
});

provider.start().then(() => {
  server.listen(8084, () => {
    console.log('%s listening at %s', server.name, server.url);
  });
}).catch(e => console.log(e));