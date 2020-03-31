
const http = require('http');
const dhost = require('dhost');

/**
 * Runs a static HTTP server, backed onto dhost, which renders a test harness.
 * 
 * @param {string} harnessName
 * @param {function(): string} render
 * @return {!Promise<!http.Server>}
 */
module.exports = function runServer(harnessName, render) {
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
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.write(render());
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
