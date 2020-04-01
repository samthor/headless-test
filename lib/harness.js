
const fs = require('fs').promises;

/**
 * Builds a request interception handler for the given top-level origin and nonce.
 *
 * Responds to two different classes of requests:
 *   - generated harness HTML that loads the relevant tests and allows the browser to behave 'as
 *     normal' in the correct folder
 *   - top-level handlers for Mocha/Chai (and potentially other future deps)
 */
module.exports = async (serverUrl, nonce) => {
  const content = {};
  const work = ['mocha/mocha.js', 'chai/chai.js'].map((file) => {
    let resolved;
    try {
      resolved = require.resolve(file);
    } catch (e) {
      console.warn('Could not find dependency:', file);
      return;
    }
    const p = fs.readFile(resolved, 'utf-8').then((raw) => {
      // This seems unlikely, but will break the HTML embed.
      if (raw.includes('</script>')) {
        throw new Error(`can't embed source, contains closing </script>`);
      }
      content['node_modules/' + file] = raw;
    });
    return p;
  });
  await Promise.all(work);

  const harnessUrl = new URL(`./${nonce}`, serverUrl);
  const harnessHtml = `
<!DOCTYPE html>
<html>
<head>
<script src="/${nonce}/node_modules/mocha/mocha.js"></script>
<script src="/${nonce}/node_modules/chai/chai.js"></script>
</head>
<body></body>
</html>
  `;

  return (r) => {
    const {origin, pathname} = new URL(r.url());
    if (origin !== serverUrl.origin) {
      return r.continue();
    }

    // Serve harness HTML.
    if (pathname === harnessUrl.pathname) {
      return r.respond({body: harnessHtml, contentType: 'text/html; charset=utf-8'});
    }

    // Potentially serve one of the dependencies.
    if (pathname.startsWith(`/${nonce}/`)) {
      const raw = content[pathname.substr(nonce.length + 2)];
      if (raw !== undefined) {
        return r.respond({body: raw, contentType: 'text/javascript'});
      }
    }

    return r.continue();
  };
};