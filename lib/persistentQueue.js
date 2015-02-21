
var assert = require('assert');
var typeForce = require('typeforce');
var Task = require('./downloadTask');
var levelup = require('levelup');
var mkdirp = require('mkdirp');
var path = require('path');
var EventEmitter = require('events').EventEmitter
var inherits = require('util').inherits;
var noop = function() {};

function Queue(options) {
  var self = this;

  typeForce({
    db: 'String',
    maxConcurrency: 'Number'
  }, options);

  this.maxConcurrency = options.maxConcurrency;
  this.queue = [];
  this.running = [];

  // create db directory if needed
  mkdirp(path.dirname(options.db), function(err) {
    if (err) return self.emit('error', err);

    self.db = levelup(options.db, { valueEncoding: 'json' });
    self._loadSavedPending();
  });

  this.on('taskend', function(task) {
    // done one way or another
    self._save(task);
    // ignore failed saves for now

    self.running.splice(self.running.indexOf(task), 1);
  });

  ['taskpush', 'taskstart', 'taskend'].forEach(function(event) {
    self.on(event, function() {
      self._process();
    })
  });
}

inherits(Queue, EventEmitter);

/**
 * @param {Task} task
 * @param {Function} cb - called with task id when push is persisted
 */
Queue.prototype.push = function(task, cb) {
  var self = this;

  if (!this.ready) throw new Error('Wait for "ready" event before queueing tasks');

  assert(task instanceof Task, 'Invalid task');
  cb = cb || noop;

  if (task.fromStorage) {
    onsaved();
  }
  else {
    this._save(task, onsaved);
  }

  function onsaved(err) {
    if (err) return cb(err);

    self.queue.push(task);
    self.emit('taskpush', task);
    cb();
  }
}

Queue.prototype.findTaskById = function(id, cb) {
  typeForce('String', id);
  typeForce('Function', cb);

  var cursor = this.db.get(id, function(err, doc) {
    if (err) return cb(err);

    cb(null, doc && new Task(doc));
  });
}

Queue.prototype._loadSavedPending = function() {
  var self = this;
  var tasks = [];

  this.db.createReadStream()
    .on('data', function(data) {
      if (data.status === 'pending') {
        var task = new Task(data.value);
        task.fromStorage = true;
        tasks.push(task);
      }
    })
    .on('error', function(err) {
      self.emit('error', err);
    })
    .on('end', function() {
      self.ready = true;
      self.emit('ready');
      tasks.forEach(function(task) {
        self.push(task);
      });
    });
}

Queue.prototype._process = function() {
  var self = this;

  if (!this.queue.length && !this.running.length) this.emit('empty');

  if (!this.queue.length || this.running.length >= this.maxConcurrency) return;

  var task = this.queue.shift();
  this.running.push(task);

  task.run(function() {
    self.emit('taskend', task);
  });

  this.emit('taskstart', task);
}

Queue.prototype._save = function(task, cb) {
  cb = cb || noop;

  var json = task.toJSON();
  this.db.put(json.id, json, function(err) {
    if (err) return cb(err);

    cb(null, json.id);
  });
}

Queue.prototype.destroy = function(cb) {
  this.db.close(cb);
}

module.exports = Queue;
