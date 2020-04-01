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
const buildHarness = require('./lib/harness.js');

function urlFromInput(raw) {
  if (raw instanceof URL || typeof raw === 'string') {
    return new URL(raw);
  }
  const addr = raw.address();
  const addressPart = addr.family === 'IPv6' ? `[${addr.address}]` : addr.address;
  return new URL(`http://${addressPart}:${addr.port}`);
}

/**
 * @param {!http.Server|!https.Server|!URL|string} server
 * @param {!Object=} options
 */
module.exports = async function(server, options) {
  options = Object.assign({
    args: [],
    debug: false,
    load: [],
    virtual: [],
    driver: {},
    done: null,
    // no implicit timeout
  }, options);

  const doneHandler = options.done;
  delete options.done;  // not serializable

  const args = options.args.slice();
  const cleanup = [];

  // It's valid but weird to pass a null URL. Create a dummy server that doesn't point to anything.
  if (server == null) {
    server = await runServer();
    cleanup.push(() => server.close());
  }

  // If we're passed a real http[s].Server, get its address. Otherwise, treat it as a URL.
  const url = urlFromInput(server);
  const testNonce = `__test=${Math.floor(Math.random() * 0xffffffff).toString(16)}`;

  if (process.env.CI || process.env.TRAVIS) {
    args.push('--no-sandbox', '--disable-setuid-sandbox');
  }

  const p = (async function runner() {
    const browser = await puppeteer.launch({headless: !options.debug, args});
    cleanup.push(async () => {
      await browser.disconnect();
      await browser.close();
    });

    const pages = await browser.pages();
    const page = pages[0] || await browser.newPage();
    cleanup.push(() => page.close());

    let resolveCompleted;
    const completedPromise = new Promise((resolve, reject) => {
      resolveCompleted = resolve;
      page.on('pageerror', reject);
    });

    page.on('error', (err) => console.warn('got page err', err));

    // Log all output but ensure it runs in the right order, as each message technically includes
    // data we need to await (jsonValue below).
    let consolePromise = Promise.resolve();
    page.on('console', (msg) => {
      consolePromise = consolePromise.then(async () => {
        const args = await Promise.all(msg._args.map((arg) => arg.jsonValue()));
        const out = util.format(...args);
        process.stdout.write(out + '\n');
      });
    });
    page.on('dialog', (dialog) => dialog.dismiss());

    // We can't pass a function through to the evaluate function, as it's not Seralizable.
    await page.exposeFunction('__headlessDone', resolveCompleted);
    await page.evaluateOnNewDocument(require('./lib/preload.js'), options);
    await page.setRequestInterception(true);

    const handler = await buildHarness(url, testNonce);
    page.on('request', handler);
    await page.goto((new URL(`./${testNonce}`, url)).toString());

    return completedPromise;
  })();

  try {
    return await p;  // we're an async function so this will still be a Promise
  } finally {
    doneHandler && await doneHandler();
    while (cleanup.length !== 0) {
      await cleanup.pop()();
    }
  }
};
