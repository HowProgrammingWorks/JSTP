'use strict';

const test = require('tap');

const jstp = require('../../');

const name = 'testApp';

const interfaces = {
  calculator: {
    answer(connection, callback) {
      callback(null, 42);
    },
    divide(connection, divided, divider, callback) {
      if (!divider) {
        callback(new Error('Zero division'));
      } else {
        callback(null, divided / divider);
      }
    },
    doNothing(connection, callback) {
      callback(null);
    }
  }
};

const app = {
  name,
  interfaces
};

const application = new jstp.Application(app.name, app.interfaces);

let server;
let client;

test.beforeEach((done) => {
  const port = 3335;
  server = jstp.tcp.createServer(port, [application], app.authCallback);

  server.listen(() => {
    client = jstp.tcp.createClient({ host: 'localhost', port });
    done();
  });
});

test.afterEach((done) => {
  client.disconnect();
  server.close();
  done();
});

test.test('must perform call with no arguments and no return value', (test) => {
  client.connectAndInspect(app.name, null, null, ['calculator'],
    (error, connection, api) => {
      api.calculator.doNothing((error) => {
        test.assertNot(error, 'must be no error');
        test.end();
      });
    }
  );
});

test.test('must perform call with no arguments and return value', (test) => {
  client.connectAndInspect(app.name, null, null, ['calculator'],
    (error, connection, api) => {
      api.calculator.answer((error, result) => {
        test.assertNot(error, 'must be no error');
        test.equal(result, 42);
        test.end();
      });
    }
  );
});

test.test('must perform call with arguments and return value', (test) => {
  client.connectAndInspect(app.name, null, null, ['calculator'],
    (error, connection, api) => {
      api.calculator.divide(20, 10, (error, sum) => {
        test.assertNot(error, 'must be no error');
        test.equal(sum, 2);
        test.end();
      });
    }
  );
});

test.test('must perform call that returns an error', (test) => {
  client.connectAndInspect(app.name, null, null, ['calculator'],
    (error, connection, api) => {
      api.calculator.divide(10, 0, (error) => {
        test.assert(error, 'must be an error');
        test.equal(error.code, 1);
        test.end();
      });
    }
  );
});

test.test('must return error on call to nonexistent interface', (test) => {
  client.connectAndHandshake(app.name, null, null, (error, connection) => {
    connection.callMethod(
      '__nonexistent_interface__',
      '__nonexistent_method__',
      [],
      (error) => {
        test.assert(error, 'must be an error');
        test.equal(error.code, jstp.ERR_INTERFACE_NOT_FOUND,
          'error must be an ERR_INTERFACE_NOT_FOUND');
        test.end();
      }
    );
  });
});

test.test('must return error on call to nonexistent method', (test) => {
  client.connectAndHandshake(app.name, null, null, (error, connection) => {
    connection.callMethod('calculator', '__nonexistent_method__', [],
      (error) => {
        test.assert(error, 'must be an error');
        test.equal(error.code, jstp.ERR_METHOD_NOT_FOUND,
          'error must be an ERR_METHOD_NOT_FOUND');
        test.end();
      }
    );
  });
});
