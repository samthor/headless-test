Runs tests in a headless browser (Chrome-only via Puppeteer for now).
Useful to test Web Components, polyfills, or anything else that needs real browser APIs.

Uses [Mocha](https://npmjs.com/package/mocha) and provides the [Chai](https://npmjs.com/package/chai) assertion library.

# Usage

Install `headless-test` via your favourite package manager.

## Command-Line or CI

Run and pass a number of files (including tests) which will be loaded in-order as ESM:

```bash
headless-test your-code.js your-tests.js
```

This will exit with non-zero if the Mocha tests fail.
Easy!

Note that `your-tests.js` should look like a totally normal Mocha test file:

```js
// no imports required for Mocha or Chai
describe('Group', () => {
  it('does a thing', async () => {
    assert(true, 'this passes');
    // ...
  });
});
```

You can also specifiy `-t` to switch Mocha to TDD mode (the author's preferred mode).

This works by hosting a webserver in the current directory (with [dhost](https://npmjs.com/package/dhost)) so you can load other dependencies.

### Extras

CSS can also be included in the page for tests.
For example:

```bash
headless-test your-code.js your-css.css your-tests.js
```

## API

You can also use `headless-test` programatically.
The most common use case is to pass a URL (e.g., if you're already running a dev server) and specify `load` to load specific resources as ESM into the test environment.

```js
const headlessTest = require('headless-test');

const p = headlessTest('http://localhost:8080', {
  load: ['your-code.js', 'your-tests.js'],
  driver: {
    // options passed to `mocha.setup`
    ui: 'tdd',
  },
});

p.then(() => /* something */);
```

Instead of passing a URL, you can also pass a `http.Server` to read its URL (e.g., if you're running a dev server in the same process).

### Virtual Resources

You can also specify _virtual_ script files, if your tests aren't able to be found on your local web server.
They'll still be run in the same origin, but won't be able to `import` each other.
For example:

```js
const p = headlessTest('http://localhost:1234', {
  load: [
    {code: 'console.info("hello"); suite("tests", () => { /* stuff */ });'},
    {code: testCode},
  ],
});
```

If you're not loading any real script files, it's valid to pass `null` for the URL.

## Notes

Don't use this for integration tests.
You should be running Mocha locally for that, and having it start Puppeteer to click on things.
