'use strict';

const events = require('events');
const util = require('util');

const apps = require('./applications');
const common = require('./common');
const Connection = require('./connection');
const simpleAuth = require('./simple-auth');

const HANDSHAKE_TIMEOUT = 3000;

module.exports = Server;

// JSTP server
//   rawServer - an underlying server or its adapter
//   applications - applications index
//   authCallback - authentication callback (optional)
//   heartbeatInterval - heartbeat interval, if heartbeat should be used
//                       (optional)
//
function Server(rawServer, applications, authCallback, heartbeatInterval) {
  events.EventEmitter.call(this);

  if (Array.isArray(applications)) {
    applications = apps.createAppsIndex(applications);
  }

  if (typeof(authCallback) === 'number') {
    heartbeatInterval = authCallback;
    authCallback = null;
  }

  this.rawServer = rawServer;
  this.applications = applications;
  this.startSession = authCallback || simpleAuth.startSession;
  this.heartbeatInterval = heartbeatInterval;

  this.clients = {};
  this._cachedClientsArray = [];

  this.on('connect', this._onClientConnect.bind(this));
  this.on('disconnect', this._onClientDisconnect.bind(this));

  rawServer.on('connection', this._onRawConnection.bind(this));

  common.forwardMultipleEvents(rawServer, this, [
    'listening',
    'close',
    'error'
  ]);
}

util.inherits(Server, events.EventEmitter);

// Switch the server into the listening state, if the underlying server
// supports such operation. In some cases, for example, when a JSTP server has
// been created on top of existing WebSocket connection, this function does
// nothing apart from calling a callback.
//   callback - callback function (optional)
//
Server.prototype.listen = function(callback) {
  this.rawServer.listen(callback);
};

// Stop listening for connections and shut down the server
//
Server.prototype.close = function() {
  this.rawServer.close();

  Object.keys(this.clients).forEach((cid) => {
    const connection = this.clients[cid];
    connection.close();
  });

  this.clients = {};
  this._cachedClientsArray = [];
};

// Get all clients as an array of JSTP connection instances
//
Server.prototype.getClients = function() {
  if (this._cachedClientsArray.length === 0) {
    this._cachedClientsArray = Object.keys(this.clients)
      .map(cid => this.clients[cid]);
  }

  return this._cachedClientsArray;
};

// Handler of a new connection event emitter from the underlying server
//   socket - a lower-level socket or connection
//
Server.prototype._onRawConnection = function(socket) {
  const connection = new Connection(
    this.rawServer.createTransport(socket), this);

  connection.on('error', (error) => {
    this.emit('connectionError', error, connection);
  });

  connection.setTimeout(HANDSHAKE_TIMEOUT, () => {
    if (!connection.handshakeDone) {
      connection.close();
      this.emit('handshakeTimeout', connection);
    } else if (this.heartbeatInterval) {
      connection.startHeartbeat(this.heartbeatInterval);
    }
  });
};

// Client connection event handler
//   connection - JSTP connection instance
//
Server.prototype._onClientConnect = function(connection) {
  this.clients[connection.id] = connection;
  this._cachedClientsArray.push(connection);
};

// Client connection close event handler
//   connection - JSTP connection instance
//
Server.prototype._onClientDisconnect = function(connection) {
  delete this.clients[connection.id];
  this._cachedClientsArray = [];
};
