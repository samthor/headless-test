
const http = require('http');

/**
 * Runs a static HTTP server with the optional handler. Serves 404 for all unhandled requests.
 * 
 * @param {!Function} handler
 * @return {!Promise<!http.Server>}
 */
module.exports = function runServer(handler) {
  const options = {
    host: 'localhost',  // needed to force IPv4
    port: 0,            // choose unused high port
  };
  handler = handler || ((req, res, next) => next(req, res));

  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(options, () => resolve(server));
    server.on('request', (req, res) => {
      handler(req, res, () => {
        res.writeHead(404);
        res.end();
      });
    });
    server.on('error', reject);
  });
}
