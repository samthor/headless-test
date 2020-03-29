/*
 * Copyright 2018 Sam Thorogood. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */

'use strict';

const puppeteer = require('puppeteer');
const dhost = require('dhost');
const http = require('http');
const util = require('util');

const harnessName = '__harness.html';

function formatHost(addr) {
  if (addr.family === 'IPv6') {
    return `[${addr.address}]:${addr.port}`;
  }
  return `${addr.address}:${addr.port}`;
}

function runServer(renderHarness) {
  const options = {
    host: 'localhost',  // needed to force IPv4
    port: 0,            // choose unused high port
  };
  return new Promise((resolve, reject) => {
    const handler = dhost({
      listing: false,
    });
    const server = http.createServer();
    server.listen(options, () => resolve(server));
    server.on('request', (req, res) => {
      handler(req, res, () => {
        if (req.url === `/${harnessName}`) {
          res.setHeader('Content-Type', 'text/html');
          res.write(renderHarness());
          return res.end();
        }
        // next() is called so dhost didn't handle us, serve 404
        res.writeHead(404);
        res.end();
      });
    });
    server.on('error', reject);
  });
}

/**
 * Serialized and run inside the client/test page.
 */
function wrapMocha() {
  const log = console.log.bind(console);
  console.log = (...args) => {
    if (args.length !== 0) {
      return log(...args);
    } else {
      return log('');  // send blank line if no args
    }
  };

  function runnerDone(runner) {
    // store tests under their categories
    const tests = {'all': []};
    ['pass', 'fail', 'pending'].forEach((type) => {
      const t = [];
      tests[type] = t;
      runner.on(type, (test) => {
        const flat = flatten(test);
        t.push(flat);
        tests['all'].push(flat);
      });
    });

    /**
     * Flatten Mocha's `Test` object into plain JSON.
     */
    function flatten(test) {
      return {
        title: test.title,
        duration: test.duration,
        err: test.err ? Object.assign({}, test.err) : null,
      };
    }

    return new Promise((resolve) => {
      runner.on('end', () => resolve(tests));
    });
  }

  Object.defineProperty(window, 'mocha', {
    get() {
      return undefined;
    },
    set(instance) {
      delete window.mocha;
      window.mocha = instance;

      // trick Mocha into outputing terminal-like output
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
}

module.exports = function(options) {
  options = Object.assign({
    args: [],
    path: '',
    headless: true,
    log: true,
    resources: [],
  }, options);

  const args = options.args.slice();
  const cleanup = [];

  if (process.env.CI || process.env.TRAVIS) {
    args.push('--no-sandbox', '--disable-setuid-sandbox');
  }

  const p = (async function runner() {
    const server = await runServer(() => {
      return `
<!DOCTYPE html>
<html>
<head>
<link type="stylesheet" href="/node_modules/mocha/mocha.css" />
<script src="/node_modules/mocha/mocha.js"></script>
<script src="/node_modules/chai/chai.js"></script>
<script>
// TODO: assumes TDD
mocha.setup({ui: 'tdd'});
window.assert = chai.assert;
</script>

${
  options.resources.map((x) => {
    if (typeof x !== 'string') {
      throw new Error(`resource must be string: ${x}`);
    }
    return `<script src=${JSON.stringify(x)}></script>`
  })
}

<script>
(function() {
  var pageError = null;

  window.addEventListener('error', function(event) {
    pageError = event.filename + ':' + event.lineno + ' ' + event.message;
  });

  window.addEventListener('load', function() {
    if (pageError) {
      suite('page-script-errors', function() {
        test('no script errors on page', function() {
          throw pageError;
        });
      });
    }
    mocha.run();
  });
})();
</script>

</head>
<body>

</body>
</html>
      `;
    });
    cleanup.push(() => server.close());

    const browser = await puppeteer.launch({headless: options.headless, args});
    cleanup.push(() => browser.close());

    const pages = await browser.pages();
    const page = pages[0] || await browser.newPage();

    if (options.log) {
      page.on('console', (msg) => {
        // arg.jsonValue returns a Promise for some reason
        const p = msg._args.map((arg) => arg.jsonValue());
        Promise.all(p).then((args) => {
          const out = util.format(...args);
          process.stdout.write(out + '\n');
        });
      });
      page.on('pageerror', (err) => console.error(err));
    }
    page.on('dialog', (dialog) => dialog.dismiss());

    await page.evaluateOnNewDocument(wrapMocha);
    await page.goto(`http://${formatHost(server.address())}/${harnessName}`);

    // wait for and return test result global from page
    const timeout = 20 * 1000;
    await page.waitForFunction(() => window.__mochaTest, {timeout});
    return await page.evaluate(() => window.__mochaTest);
  })();

  return p.then(async () => {
    while (cleanup.length !== 0) {
      await cleanup.pop()();
    }
    return p;  // return original Promise if we cleaned up properly
  });
};
