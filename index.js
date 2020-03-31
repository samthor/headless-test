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
const util = require('util');
const runServer = require('./lib/server.js');

const harnessName = '__harness.html';

function formatHost(addr) {
  if (addr.family === 'IPv6') {
    return `[${addr.address}]:${addr.port}`;
  }
  return `${addr.address}:${addr.port}`;
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
  const resources = options.resources.map((r) => {
    if (!(/^\.{0,2}\//.test(r))) {
      return `./${r}`;
    }
    return r;
  });
  const cleanup = [];

  if (process.env.CI || process.env.TRAVIS) {
    args.push('--no-sandbox', '--disable-setuid-sandbox');
  }

  const p = (async function runner() {
    const server = await runServer(harnessName, () => {
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

function loadResource(r) {
  if (r.endsWith('.js')) {
    return import(r);
  } else if (!r.endsWith('.css')) {
    throw new TypeError('could not load: ' + r);
  }
  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.type = 'stylesheet';
    link.href = r;
    link.onload = resolve;
    link.onerror = reject;
    document.head.append(link);
  });
}

(function() {
  let pageError = null;
  const resources = ${JSON.stringify(resources)};

  window.addEventListener('error', (event) => {
    pageError = event.filename + ':' + event.lineno + ' ' + event.message;
  });

  window.addEventListener('load', () => {
    let p = Promise.resolve();

    if (pageError) {
      suite('page-script-errors', () => {
        test('no script errors on page', () => {
          throw pageError;
        });
      });
    } else {
      p = p.then(() => Promise.all(resources.map(loadResource)));
    }

    p.then(() => {
      mocha.run();
    }).catch((err) => {
      throw err;
      console.warn("resource problem", err);
    });
  });
})();

</script>

</head>
<body></body>
</html>
      `;
    });
    cleanup.push(() => server.close());

    const methodArgs = [];
    const browser = await puppeteer.launch({headless: options.headless, args: methodArgs});
    cleanup.push(() => browser.close());

    const pages = await browser.pages();
    const page = pages[0] || await browser.newPage();

    // TODO(samthor): This rejects on unhandled page errors. We may want to wrap
    // this in nicer output.
    const errorPromise = new Promise((_, reject) => {
      page.on('pageerror', reject);
    });

    if (options.log) {
      let p = Promise.resolve();
      page.on('console', (msg) => {
        p = p.then(async () => {
          // arg.jsonValue returns a Promise for some reason
          const args = await Promise.all(msg._args.map((arg) => arg.jsonValue()));
          const out = util.format(...args);
          process.stdout.write(out + '\n');
        });
      });
    }
    page.on('dialog', (dialog) => dialog.dismiss());

    const args = [];
    await page.evaluateOnNewDocument(require('./lib/preload.js'), args);
    await page.goto(`http://${formatHost(server.address())}/${harnessName}`);

    // wait for and return test result global from page
    const timeout = 20 * 1000;
    const resultPromise = page.waitForFunction(() => window.__mochaTest, {timeout})
        .then((handle) => handle.jsonValue());
    return Promise.race([resultPromise, errorPromise]);
  })();

  return p.then(async () => {
    if (!options.headless) {
      console.info('Browser open for debug, hit ENTER to continue...');
      await new Promise((r) => {
        process.stdin.on('data', r);
      });
    }

    while (cleanup.length !== 0) {
      await cleanup.pop()();
    }
    return p;  // return original Promise if we cleaned up properly
  });
};
