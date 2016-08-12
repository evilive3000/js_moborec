"use strict";

// const validator = require('./validation').validator;

var redis = require("redis"),
  client = redis.createClient({
    host: "redis",
    // prefix: "recom-",
    db: 2,
    detect_buffers: true
  });

const Provider = require('./data_provider');
const Adviser = require('./adviser');
const adviser = new Adviser(new Provider(client));

const events = Object.keys(require('./event_types'));

let count = 1000;

function newevent(){
  const user = Math.round(Math.random() * 4) + 1;
  const item = Math.round(Math.random() * 39) + 1;
  const type = events[Math.round(Math.random() * 2)];
  return [user, item, type];
}

(function run(){
  if (--count <= 0) return;
  adviser.addEvent(...newevent()).then(run);
})();

// adviser.addEvent(1, 3, 'download');

// adviser.addEvent(1, 4, 'download');
// adviser.addEvent(1, 3, 'vote_up');
// adviser.addEvent(1, 6, 'download');
// console.log();


// const restify = require('restify');
// const server = restify.createServer({});
//
// server.use(restify.bodyParser());
//
// server.get('/stats', (req, res, next) => {
//   res.send('stats');
//   next();
// });
//
//
// server.get('/events', (req, res, next) => {
//   res.send('events');
//   next();
// });
//
//
// server.get('/recom/:oid', (req, res, next) => {
//   req.params.oid && (req.params.oid = parseInt(req.params.oid, 10));
//   if (!validator.validate('get_recom', req.params)) {
//     return next(new restify.UnprocessableEntityError(validator.errorsText()));
//   }
//   res.send('recom:' + req.params.oid);
//   next();
// });
//
//
// server.post('/event', (req, res, next) => {
//   if (!validator.validate('post_event', req.params)) {
//     return next(new restify.UnprocessableEntityError(validator.errorsText()));
//   }
//   res.send(req.params);
//   next();
// });
//
//
// server.listen(8088, function () {
//   console.log('%s listening at %s', server.name, server.url);
// });