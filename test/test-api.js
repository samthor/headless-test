#!/usr/bin/env node

const headlessTest = require('../index.js');
const polka = require('polka');
const dhost = require('dhost');

process.on('unhandledRejection', (e) => {
  console.error(e);
  process.exit(1);
});

function invert(p) {
  return p.then((out) => {
    throw out;
  }, (err) => {
    return err;
  });
}

(async function() {
  const {server} = await new Promise((resolve, reject) => {
    const runner = polka()
      .use(dhost({
        path: __dirname,
      }))
      .listen(3000, (err) => err ? reject(err) : resolve(runner));
  });

  await headlessTest('http://localhost:3000', {
    load: ['suite-pass.js'],
    driver: {
      ui: 'tdd',
    },
  });

  await invert(headlessTest('http://localhost:3000', {
    load: ['suite-fail.js'],
    driver: {
      ui: 'tdd',
    },
  }));

  server.close();  // done with server tests

  const code = `
describe('Tests', () => {
  it('works', () => {
    assert(true);
  });
});
  `;
  await headlessTest(null, {
    load: [
      {code},
    ],
    driver: {
      ui: 'bdd',
    }
  });
}());
