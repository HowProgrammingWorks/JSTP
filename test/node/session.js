'use strict';

const test = require('tap');

const jstp = require('../..');

const app = require('../fixtures/application');
const application = new jstp.Application(app.name, app.interfaces);

const serverConfig = { applications: [application] };

let server;
let connection;
let port;

test.beforeEach((done) => {
  server = jstp.net.createServer(serverConfig);
  server.listen(0, () => done());
});

test.afterEach((done) => {
  if (connection) {
    connection.close();
    connection = null;
  }
  server.close();
  done();
});

test.test('must reconnect to existing session', (test) => {
  port = server.address().port;
  jstp.net.connect(app.name, null, port, (error, conn, session) => {
    test.assertNot(error, 'handshake must not return an error');
    test.equal(conn.username, null, 'username must be null');
    test.assert(session instanceof jstp.Session,
      'session must be an instance of jstp.Session');
    const client = { session };
    jstp.net.connect(app.name, client, port, (error, conn, session) => {
      connection = conn;
      test.assertNot(error, 'must successfully reconnect to existing session');
      test.assertNot(session, 'must not return Session object');
      test.end();
    });
  });
});

test.test('must not resend messages received by other side', (test) => {
  test.plan(6);
  port = server.address().port;
  jstp.net.connect(app.name, null, port, (error, conn, session) => {
    test.assertNot(error, 'handshake must not return an error');
    test.equal(conn.username, null, 'username must be null');
    test.assert(session instanceof jstp.Session,
      'session must be an instance of jstp.Session');
    const client = { session };
    conn.callMethod('calculator', 'doNothing', [], (error) => {
      test.assertNot(error, 'call must not return an error');
    });
    jstp.net.connect(app.name, client, port, (error, conn, session) => {
      connection = conn;
      test.assertNot(error, 'must successfully reconnect to existing session');
      test.assertNot(session, 'must not return Session object');
    });
  });
});
