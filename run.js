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

const run = require('./index.js');
const mri = require('mri');

const options = mri(process.argv.slice(2), {
  boolean: ['debug'],
});
if (!options._.length) {
  console.error('fatal: path must be specified as 2nd arg');
  process.exit(-2);
}

void async function() {
  const out = await run({
    resources: options._,
    headless: !options.debug,
  });
  if (out.fail.length) {
    process.exit(out.fail.length);
  }
}();
