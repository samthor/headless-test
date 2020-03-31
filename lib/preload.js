
/**
 * Serialized and run inside the client/test page.
 *
 * Not actually run by Node.
 */
module.exports = function() {
  try {
    window.__dirname;
    process.exit;
    throw new Error(`should not run inside Node`);
  } catch (e) {
    // ok
  }

  // Puppeteer swallows empty calls to `console.log` and friends. Mocha uses `console.log` to space
  // out test output; send a blank line here.
  const log = console.log.bind(console);
  console.log = (...args) => {
    args.length || args.push('');
    return log(...args);
  };

  function runnerDone(runner) {
    const flatten = (test) => {
      return {
        title: test.title,
        duration: test.duration,
        err: test.err || null,
      };
    };

    // store tests under their categories
    const tests = {};
    const all = tests['all'] = [];
    ['pass', 'fail', 'pending'].forEach((type) => {
      const t = tests[type] = [];
      runner.on(type, (test) => {
        const flat = flatten(test);
        t.push(flat);
        all.push(flat);
      });
    });

    // TODO(samthor): Do we ever see these?
    if (tests['pending'].length) {
      throw new Error(`unexpected pending tests: ${tests['pending'].length}`);
    }

    return new Promise((resolve) => {
      runner.on('end', () => resolve(tests));
    });
  }

  Object.defineProperty(window, 'mocha', {
    set(instance) {
      delete window.mocha;
      window.mocha = instance;

      // trick Mocha into generating terminal-like output
      instance.constructor.reporters.Base.useColors = true;
      instance.reporter(Mocha.reporters.spec);

      const run = instance.run.bind(instance);
      instance.run = (...args) => {
        const runner = run(...args);

        // steal output and log to common global to report completion
        runnerDone(runner).then((out) => {
          window.__mochaTest = out;
        });

        return runner;
      };

      delete window.mocha;
      window.mocha = instance;
    },
    configurable: true,
  });
};
