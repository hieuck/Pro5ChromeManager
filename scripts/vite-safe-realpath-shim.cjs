const childProcess = require('node:child_process');

const originalExec = childProcess.exec;

function createNoopChild() {
  return {
    pid: 0,
    stdout: null,
    stderr: null,
    kill() {
      return true;
    },
    on() {
      return this;
    },
    once() {
      return this;
    },
    emit() {
      return false;
    },
    removeListener() {
      return this;
    },
  };
}

childProcess.exec = function patchedExec(command, options, callback) {
  let normalizedCallback = callback;
  if (typeof options === 'function') {
    normalizedCallback = options;
  }

  if (typeof command === 'string' && command.trim().toLowerCase() === 'net use') {
    process.nextTick(() => {
      if (typeof normalizedCallback === 'function') {
        normalizedCallback(new Error('Skipped "net use" for Vite realpath optimization'), '', '');
      }
    });
    return createNoopChild();
  }

  return originalExec.apply(this, arguments);
};
