
var typeForce = require('typeforce');
var path = require('path');
var express = require('express');
var bodyParser = require('body-parser');
var Queue = require('./persistentQueue');
var Task = require('./downloadTask');

function createServer(conf, callback) {
  typeForce({
    db: 'String',
    port: 'Number',
    maxConcurrency: 'Number'
  }, conf);

  if (conf.db) conf.db = path.join(__dirname, conf.db);

  var server;
  var queue = new Queue({
    db: conf.db,
    maxConcurrency: conf.maxConcurrency
  });

  queue.on('ready', function() {
    server = app.listen(conf.port, callback);
  });

  var app = express();

  app.use(bodyParser.urlencoded({ extended: true }));

  app.get('/get', function(req, res, next) {
    var id = req.query.id;
    if (typeof id === 'undefined') return sendErr(res, 400, 'Missing required parameter "id"');

    queue.findTaskById(id, function(err, job) {
      if (err) {
        if (err.type === 'NotFoundError') {
          return sendErr(res, 404, 'Job not found');
        }
        else {
          return sendErr(res, 500, 'We were unable to check the status of your job, please try again')
        }
      }

      res.status(200).json({
        status: 'success',
        data: job
      });
    });
  });

  app.post('/queue', function(req, res, next) {
    var url = req.body.url;
    if (!url) return sendErr(res, 400, 'Missing required parameter "url"');

    var task = new Task({
      url: url
    });

    queue.push(task, function(err) {
      if (err) return sendErr(res, 500, 'We were unable to queue your job, please try again');

      res.status(200).json({
        status: 'success',
        data: {
          id: task.id
        }
      });
    });
  });

  app.use(function(err, req, res, next) {
    sendErr(res, 500, 'An unknown error ocurred');
  });

  return {
    destroy: function(cb) {
      var togo = 2;
      queue.destroy(finish);
      server.close(finish);
      function finish() {
        if (--togo === 0 && cb) cb();
      }
    }
  }
}

function sendErr(res, code, msg) {
  res.status(code).json({
    status: 'fail',
    data: {
      error: msg
    }
  })
}

module.exports = createServer;
