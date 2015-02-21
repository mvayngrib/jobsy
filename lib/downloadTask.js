
var request = require('request');
var extend = require('extend');
var uuid = require('node-uuid');
var noop = function() {};
var DEFAULT_PROPS = {
  id: null,
  url: null,
  status: 'pending',
  details: null,
  result: null
}

function DownloadTask(props) {
  extend(this, DEFAULT_PROPS, props || {});
  if (!this.id) this.id = uuid.v4();
}

DownloadTask.prototype.run = function(cb) {
  var self = this;

  if (this.status !== 'pending') throw new Error('A task can only be started once');

  this.status = 'running';
  request(this.url, function(err, resp, body) {
    if (err) {
      self.status = 'error';
      self.details = err.message;
    }
    else {
      try {
        self.result = JSON.parse(body);
        self.status = 'success';
      } catch (err) {
        self.status = 'error';
        self.details = 'Failed to parse response JSON';
      }
    }

    cb();
  });
}

DownloadTask.prototype.toJSON = function() {
  var json = {
    id: this.id,
    url: this.url,
    status: this.status,
    details: this.details,
    result: this.result
  };

  return json;
}

module.exports = DownloadTask;
