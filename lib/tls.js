'use strict';

const tls = require('tls');

const sock = require('./socket');
const jstpServer = require('./server');
const common = require('./common');

class Server extends tls.Server {
  // Constructs JSTP Server bound to node tls.Server.
  //   options - if array then it will be wrapped as { applications: options }
  //             else must be an object that contains applications array or
  //             index and can optionally contain authPolicy and
  //             heartbeatInterval (see jstp.Server).
  //             Also it will be passed directly to node tls.Server.
  //   listener - request listener that will be passed directly to
  //              tls.Server
  //
  // See node tls.Server for option docs.
  //
  constructor(options, listener) {
    if (Array.isArray(options)) {
      options = { applications: options };
    }
    super(options, listener);
    jstpServer.initServer.call(this, options.applications,
      options.authPolicy, options.heartbeatInterval);
    this.on('secureConnection', socket => this._onRawConnection(socket));
  }

  // Create a JSTP transport from a socket
  //   socket - socket instance
  //
  createTransport(socket) {
    return new sock.Transport(socket);
  }
}
common.mixin(Server, jstpServer.Server);

// Create tls JSTP server
// see jstp.tls.Server
//
const createServer = (options, listener) => {
  return new Server(options, listener);
};

const createConnection =
  sock.createConnectionFactory(tls.connect);

const createConnectionAndInspect =
  sock.createConnectionAndInspectFactory(tls.connect);

module.exports = {
  Server,
  createServer,
  // see transportCommon.createConnectionFactory
  createConnection: (appName, client, ...options) =>
    createConnection(appName, client, ...options),
  // see transportCommon.createConnectionAndInspectFactory
  createConnectionAndInspect: (appName, client, interfaces, ...options) =>
    createConnectionAndInspect(appName, client, interfaces, ...options)
};
