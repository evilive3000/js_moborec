"use strict";

const validator = require('./validation').validator;

const Adviser = require('./adviser');
const adviser = new Adviser();

const restify = require('restify');
const server = restify.createServer({});

server.use(restify.bodyParser());

server.get('/stats', (req, res, next) => {
  res.send('stats');
  next();
});


server.get('/events', (req, res, next) => {
  res.send('events');
  next();
});


server.get('/recom/:oid', (req, res, next) => {
  req.params.oid && (req.params.oid = parseInt(req.params.oid, 10));
  if (!validator.validate('get_recom', req.params)) {
    return next(new restify.UnprocessableEntityError(validator.errorsText()));
  }
  res.send('recom:' + req.params.oid);
  next();
});


server.post('/event', (req, res, next) => {
  if (!validator.validate('post_event', req.params)) {
    return next(new restify.UnprocessableEntityError(validator.errorsText()));
  }
  res.send(req.params);
  next();
});


server.listen(8088, function () {
  console.log('%s listening at %s', server.name, server.url);
});