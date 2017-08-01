'use strict';

const { EventEmitter } = require('events');

const transportCommon = require('./transport-common');
const serde = require('./serde');
const common = require('./common');

const SEPARATOR = Buffer.alloc(1);
const MAX_MESSAGE_SIZE = 8 * 1024 * 1024;

// JSTP transport for POSIX socket
//
class Transport extends EventEmitter {
  // Constructs transport instance.
  //   socket - socket instance
  //
  constructor(socket) {
    super();

    this.socket = socket;
    this._buffer = null;
    this._uncorkSocket = this.socket.uncork.bind(this.socket);

    this.socket.on('data', this._onSocketData.bind(this));

    common.forwardMultipleEvents(this.socket, this, ['error', 'close']);
  }

  // returns underlying socket
  //
  getRawTransport() {
    return this.socket;
  }

  // Send data over the connection
  //   data - Buffer or string
  //
  send(data) {
    this.socket.cork();
    this.socket.write(data);
    this.socket.write(SEPARATOR);
    process.nextTick(this._uncorkSocket);
  }

  // End the connection optionally sending the last chunk of data
  //   data - Buffer or string (optional)
  //
  end(data) {
    if (data) {
      this.socket.cork();
      this.socket.write(data);
      this.socket.end(SEPARATOR);
    } else {
      this.socket.end();
    }
  }

  // Socket data handler
  //   data - data received
  //
  _onSocketData(chunk) {
    const messages = [];
    let parsedLength;

    if (this._buffer) {
      this._buffer = Buffer.concat([this._buffer, chunk],
        this._buffer.length + chunk.length);
    } else {
      this._buffer = chunk;
    }

    try {
      parsedLength = serde.parseNetworkMessages(this._buffer, messages);
    } catch (error) {
      this.socket.destroy(error);
      return;
    }

    if (this._buffer.length === parsedLength) {
      this._buffer = null;
    } else {
      this._buffer = this._buffer.slice(parsedLength);
    }

    const messagesCount = messages.length;
    for (let i = 0; i < messagesCount; i++) {
      this.emit('message', messages[i]);
    }

    if (this._buffer && this._buffer.length > MAX_MESSAGE_SIZE) {
      this.emit('error', new Error('Maximal message size exceeded'));
    }
  }
}

const socketFactory = (connect) => {
  const resultConnectFn = (...options) => {
    const callback = common.extractCallback(options);
    const socket = connect(...options);
    socket.once('error', (error) => {
      if (error.code !== 'EAGAIN') {
        callback(error);
        return;
      }
      process.nextTick(resultConnectFn, ...options, callback);
    });
    socket.once('connect', () => {
      socket.removeListener('error', callback);
      callback(null, socket);
    });
  };
  return resultConnectFn;
};

// Create a function that will be bound to socketFactory that will
// produce JSTP connection bound to a socket created with socketFactory.
//   connect - function that will be called with ...options
//             and must return object that emits events 'connect' and 'error'
//
// see transportCommon.newConnectFn
//
const newConnectFn = connect =>
  transportCommon.newConnectFn(socketFactory(connect), Transport);

// Same as newConnectFn but will also perform inspect of specified
// interfaces.
//
// see transportCommon.newConnectAndInspectFn
//
const newConnectAndInspectFn = connect =>
  transportCommon.newConnectAndInspectFn(socketFactory(connect), Transport);

module.exports = {
  Transport,
  newConnectFn,
  newConnectAndInspectFn,
};
