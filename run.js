#!/usr/bin/env node
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

process.on('unhandledRejection', (e) => {
  console.error(e);
  process.exit(1);
});

const dhost = require('dhost');
const run = require('./index.js');
const runServer = require('./lib/server.js');
const mri = require('mri');
const chalk = require('chalk');
const spec = require('./package.json');

const options = mri(process.argv.slice(2), {
  default: {
    debug: false,
    help: false,
    tdd: false,
  },
  alias: {
    debug: 'd',
    help: 'h',
    bdd: 'b',
  },
  unknown: (v) => {
    console.error('error: unknown option `' + v + '`');
    process.exit(1);
  },
});

const hasAnyCode = options._.some((x) => x.endsWith('.js'));
if (options.help || !hasAnyCode) {
  const helpString = `Usage: ${spec['name']} [options] <resources>

Test runner with Puppeteer driven by Mocha. Includes the specified resources as
either ESM or CSS. See https://github.com/samthor/headless-test for examples.

Starts a static server in the current directory to find resources. Won't start
unless at least one resource ending with '.js' is specified.

Options:
  -d, --debug          show test browser and delay completion
  -b, --bdd            use 'bdd' ui (default is 'tdd') for Mocha

v${spec['version']}`;

  console.info(helpString);
  process.exit(options.help ? 0 : 1);
}

function doneHandler() {
  console.info(`Browser open for debug, hit ${chalk.bgGreen('ENTER')} to continue...`);
  return new Promise((resolve) => {
    process.stdin.on('data', () => {
      process.stdin.destroy();
      resolve();
    });
  });
}

// This generates an ignored Promise. If it rejects, this will be caught in the top-level
// unhandledRejecection handler.
(async function() {
  const handler = dhost({
    listing: false,
  });
  let server;
  try {
    server = await runServer(handler);
    const ro = {
      load: options._,
      debug: options.debug,
      driver: options.bdd ? {ui: 'bdd'} : undefined,
      done: options.debug ? doneHandler : null,
    };
    await run(server, ro);
  } finally {
    server && server.close();
  }
}());
