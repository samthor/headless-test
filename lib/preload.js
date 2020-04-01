
/**
 * Serialized and run inside the client/test page.
 *
 * Not actually run by Node.
 */
module.exports = async function(options) {
  try {
    window.__dirname;
    process.exit;
    throw new Error(`should not run inside Node`);
  } catch (e) {
    // ok
  }

  // Configure default option for Mocha runner.
  options.driver = Object.assign({}, options.driver);

  // Injects a resource into the page. Currently supports JS or CSS.
  const loadResource = (r, i) => {
    if (typeof r !== 'string') {
      if (typeof r !== 'object' || typeof r.code !== 'string') {
        throw new TypeError(`invalid virtual resource without string code: ${r}`);
      }
      // TODO(samthor): We could probably inline this in a <script> tag too.
      const blob = new Blob([`// ${i}\n`, r.code], {type: 'text/javascript'});
      const url = URL.createObjectURL(blob);
      return import(url);
    }

    if (!(/^\.{0,2}\//.test(r))) {
      r = './' + r;
    }
    if (r.endsWith('.js')) {
      return import(r);
    } else if (!r.endsWith('.css')) {
      throw new TypeError(`unknown resource type: ${r}`);
    }
    return new Promise((resolve, reject) => {
      document.head.append(Object.assign(document.createElement('link'), {
        rel: 'stylesheet',
        href: r,
        onload: resolve,
        onerror() {
          reject(new Error(`could not load: ${r}`));
        },
      }));
    });
  };

  // Once readyResolve is called, the requested resources are all loaded in-order.
  const ready = (() => {
    let readyResolve = null;

    const readyPromise = (new Promise((r) => {
      readyResolve = () => {
        r();
        return readyPromise;
      };
    }).then(async () => {
      for (const resource of options.load) {
        await loadResource(resource);
      }
    }));

    return readyResolve;
  })();

  // Puppeteer swallows empty calls to `console.log` and friends. Mocha uses `console.log` to space
  // out test output; send a blank line here.
  const log = console.log.bind(console);
  console.log = (...args) => {
    args.length || args.push('');
    return log(...args);
  };

  const assignmentInterceptor = (name, fn) => {
    Object.defineProperty(window, name, {
      set(instance) {
        delete window[name];
        window[name] = fn(instance) || instance;
      },
      configurable: true,
    });
  };

  assignmentInterceptor('chai', (chai) => {
    window.assert = chai.assert;
  });

  assignmentInterceptor('mocha', (mocha) => {
    const mochaDriverOptions = Object.assign({
      ui: 'tdd',
      ...options.driver,
    });
    if (options.timeout && options.timeout > 0) {
      mochaDriverOptions.timeout = options.timeout;
    }
    mocha.setup(mochaDriverOptions);

    // Trick Mocha into generating terminal-like color output.
    mocha.constructor.reporters.Base.useColors = true;
    mocha.reporter(Mocha.reporters.spec);

    // Run Mocha and throw an uncaught error on failures.
    ready().then(() => {
      mocha.run((failures) => {
        if (failures) {
          throw new Error(`${failures} tests failed`);
        }
        window.__headlessDone();
      });
    });
  });

  window.addEventListener('load', () => {
    if (!window.mocha && options.headless) {
      throw new Error(`could not find mocha; are your deps confused?`);
    }
  });
};
