'use strict';

// TODO: support jstp://server and jstps://server

const jstp = require('.');
const readline = require('readline');

const log = console.log;
const logErr = console.error;

const commandProcessor = {};
const lineProcessor = {};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  completer
});

rl.on('line', (line) => {
  const [type, leftover] = _split(line.trim(), ' ', 1);
  if (!type) {
    return rl.prompt(true);
  }
  const processor = lineProcessor[type];
  if (!processor) {
    logErr(`Unknown command ${type}`);
  } else {
    processor(leftover, (err, result) => {
      if (err) return logErr(`${err.name} occurred: ${err.message}`);
      log(result);
    });
  }
  rl.prompt(true);
});

rl.on('SIGINT', () => {
  rl.close();
});

function completer(line) {
  return [[], line];
}

const state = {
  client: null,
  connection: null
};

commandProcessor.call = (interfaceName, methodName, args, callback) => {
  if (state.client === null) return callback(new Error('Not connected'));
  state.connection.callMethod(interfaceName, methodName, args, callback);
};

commandProcessor.event = (interfaceName, eventName, args, callback) => {
  if (state.client === null) return callback(new Error('Not connected'));
  state.connection.emitRemoteEvent(interfaceName, eventName, args);
  callback();
};

commandProcessor.connect = (host, port, appName, callback) => {
  state.client = jstp.tcp.createClient({ host, port, secure: true });
  state.client.connectAndHandshake(appName, null, null,
      (err, connection) => {
        if (!err) state.connection = connection;
        return callback(err);
      });
};

commandProcessor.disconnect = (callback) => {
  if (state.client !== null) {
    return state.client.disconnect(() => {
      state.connection = null;
      state.client = null;
      callback();
    });
  }
  callback(new Error('Not connected'));
};

function _splitArgs(token) {
  return token && _split(token, ' $ ') || [];
}

function _split(str, separator, limit, leaveEmpty) {
  const shouldTrim = (start, split) => !leaveEmpty && start === split;

  const result = [];
  let start = 0;

  for (let i = 0; !limit || i < limit; i++) {
    const split = str.indexOf(separator, start);
    if (split === -1) break;
    if (!shouldTrim(start, split)) {
      result.push(str.slice(start, split));
    } else {
      limit--;
    }
    start = split + separator.length;
  }
  if (!shouldTrim(start, str.length)) {
    result.push(str.slice(start));
  }
  return result;
}

lineProcessor.call = (tokens, callback) => {
  if (tokens === undefined) {
    return callback(new Error('Not enough arguments'));
  }
  const args = _split(tokens, ' ', 2);
  let methodArgs;
  try {
    methodArgs = jstp.parse('[' + args[2] + ']');
  } catch (err) {
    return callback(err);
  }
  commandProcessor.call(args[0], args[1], methodArgs, (err, ...result) => {
    if (err) return callback(err);
    callback(null, `Method ${args[0]}.${args[1]} returned: ` +
                   jstp.stringify(result));
  });
};

lineProcessor.event = (tokens, callback) => {
  if (tokens === undefined) {
    return callback(new Error('Not enough arguments'));
  }
  const args = _split(tokens, ' ', 2);
  let eventArgs;
  try {
    eventArgs = jstp.parse('[' + args[2] + ']');
  } catch (err) {
    return callback(err);
  }
  commandProcessor.event(args[0], args[1], eventArgs, (err) => {
    if (err) return callback(err);
    callback(null, `Event ${args[0]}.${args[1]} successfully emitted`);
  });
};

lineProcessor.connect = (tokens, callback) => {
  if (tokens === undefined) {
    return callback(new Error('Not enough arguments'));
  }
  const args = _split(tokens, ' ', 2);
  const [host, port] = _split(args[0], ':');
  const appName = args[1];
  if (appName === undefined) {
    return callback(new Error('Application name is not provided'));
  }
  commandProcessor.connect(host, port, appName, (err) => {
    if (err) return callback(err);
    callback(null, 'Connection established');
  });
};

lineProcessor.disconnect = (_, callback) => {
  commandProcessor.disconnect((err) => {
    if (err) return callback('Not connected');
    callback(null, 'Successful disconnect');
  });
};

rl.prompt(true);
