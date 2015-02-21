
var extend = require('extend');
var conf = require('../conf/config');
var test = require('tape');
var express = require('express');
var request = require('request');
var path = require('path');
var querystring = require('querystring');
var Task = require('../lib/downloadTask');
var Queue = require('../lib/persistentQueue');
var queueServer = require('../lib/server');
var fs = require('fs');
var rimraf = require('rimraf');
var staticServer;
var staticApp;
var staticAppUrl;
var fixtureUrls = [];
var dbPaths = [];

// var fbMarkUrl = 'https://graph.facebook.com/mvayngrib';
// var fbZuckUrl ='https://graph.facebook.com/zuck';
// var quandlGDPUrl = 'https://www.quandl.com/api/v1/datasets/FRED/GDP.json';

test('start static files server', function(t) {
  // setup

  var fixturesPath = path.join(__dirname, 'fixtures');
  var port = 50234;
  staticAppUrl = 'http://localhost:' + port;
  staticApp = express();
  staticApp.use(express.static(fixturesPath));
  staticServer = staticApp.listen(port, t.end);

  fixtureUrls = fs.readdirSync(fixturesPath).map(function(file) {
    return staticAppUrl + '/' + file;
  });
});

test('run a task', function(t) {
  var task = new Task({
    url: fixtureUrls[0]
  });

  t.equal(task.status, 'pending');
  task.run(onFinished);
  t.equals(task.status, 'running');
  t.throws(function() {
    task.run(); // can't run a task more than once
  });

  function onFinished() {
    t.ok(task.status === 'failed' || task.status === 'success');
    if (task.status === 'success') {
      t.ok(typeof task.result === 'object');
    }
    else {
      t.ok(typeof task.details === 'string');
    }

    t.end();
  }
});

test('limit queue max concurrency', function(t) {
  var numJobs = 10;
  t.plan(numJobs * 3 + 1); // (push + start + end) per task, and queue empty

  var dbPath = path.join(__dirname, 'testjobs1.db');
  dbPaths.push(dbPath);

  var maxConcurrency = 2;
  var q = new Queue({
    maxConcurrency: maxConcurrency,
    db: dbPath
  });

  q.on('ready', function() {
    var l = fixtureUrls.length;
    for (var i = 0; i < numJobs; i++) {
      q.push(new Task({
        url: fixtureUrls[i % l]
      }));
    }
  });

  ['taskpush', 'taskstart', 'taskend'].forEach(function(event) {
    q.on(event, function() {
      t.ok(q.running.length <= maxConcurrency);
    })
  });

  q.on('error', function(err) {
    t.error(err);
  });

  q.on('empty', function() {
    t.pass();
  });
});

test('job status', function(t) {
  t.timeoutAfter(20000);

  var numJobs = 10;
  var numFinished = 0;
  var id;
  var testConf = extend({}, conf);
  var serverUrl = 'http://localhost:' + testConf.port;
  testConf.db = 'testjobs2.db';
  dbPaths.push(path.join(__dirname, testConf.db));

  var server = queueServer(testConf, onready);

  function onready() {
    var l = fixtureUrls.length;
    for (var i = 0; i < numJobs; i++) {
      queue(fixtureUrls[i % l]);
    }
  }

  function queue(url) {
    request.post(serverUrl + '/queue', {
      headers: {
        'User-Agent': 'Super Agent/0.0.1',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: querystring.stringify({
        url: url
      })
    }, onqueued);
  }

  function onqueued(err, resp, body) {
    if (err) throw err;

    var data = JSON.parse(body).data;
    id = data.id;
    t.ok(id, 'queued job');
    checkStatus(id);
  }

  function checkStatus(id) {
    request.get(serverUrl + '/get?' + querystring.stringify({ id: id }), function(err, resp, body) {
      if (err) throw err;

      var data = JSON.parse(body).data;
      switch (data.status) {
        case 'pending':
          console.log('queue check status again');
          setTimeout(checkStatus.bind(null, id), 1000);
          break;
        case 'success':
          t.pass('job finished');
          if (++numFinished === numJobs) {
            server.destroy(t.end);
          }

          break;
        case 'error':
          throw new Error(data.details);
        default:
          throw new Error('Unknown status: ' + data.status);
      }
    });
  }
});

test('kill static files server', function(t) {
  // teardown

  t.plan(dbPaths.length + 1)
  staticServer.close(t.pass);
  dbPaths.forEach(function(dbPath) {
    rimraf(dbPath, function(err) {
      t.error(err);
    });
  })
});
