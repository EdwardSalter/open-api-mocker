"use strict";

/* istanbul ignore file */

const logger = require("lllog")();
const colors = require("colors");
const parsePreferHeader = require("parse-prefer-header");
const { pathToRegexp } = require("path-to-regexp");

const openApiMockSymbol = Symbol("openApiMock");

class Server {
  constructor() {
    this.servers = [];
    this.paths = [];
  }

  setServers(servers) {
    this.servers = servers;
    return this;
  }

  setPort() {
    return this;
  }

  setPaths(paths) {
    this.paths = paths;
    return this;
  }

  async init() {
    if (this.server) await this.shutdown();

    this._loadBasePaths();
    this.paths.forEach((path) => {
      logger.debug(
        `Processing schema path ${path.httpMethod.toUpperCase()} ${path.uri}`
      );

      const uris = this._normalizeExpressPath(path.uri);
      path.regex = pathToRegexp(uris);
    });

    const handle = (req) => {
      this._checkContentType(req);
      console.log(req);
      // Get matching path
      const matchedPath = this.paths.find((path) => {
        const expressHttpMethod = path.httpMethod.toLowerCase();
        // TODO: NEED TO GET URL RELATIVE TO SERVER ROOT BEFORE TESTING AGAINST REGEX
        return (
          expressHttpMethod === req.method.toLowerCase() &&
          path.regex.test(req.url)
        );
      });

      if (matchedPath) {
      return this.sendResponse("hi from serverless", 200);
      }

      return this._notFoundHandler(req);
      // TODO: CUSTOM ROUTING
    };
    return handle;

    // const app = express();
    // app.use('*', (req, res, next) => {
    //
    // 	res[openApiMockSymbol] = {
    // 		initTime: Date.now()
    // 	};
    //
    // 	logger.info(`${colors.yellow('>')} [${req.method}] ${req.originalUrl}`);
    //
    // 	next();
    // });
    //
    //
    // this.paths.map(path => {
    //
    // 	logger.debug(`Processing schema path ${path.httpMethod.toUpperCase()} ${path.uri}`);
    //
    // 	const expressHttpMethod = path.httpMethod.toLowerCase();
    //
    // 	const uris = this._normalizeExpressPath(path.uri);
    //
    // 	app[expressHttpMethod](uris, (req, res) => {
    //
    // 		this._checkContentType(req);
    //
    // 		const {
    // 			query,
    // 			params,
    // 			headers,
    // 			cookies,
    // 			body: requestBody
    // 		} = req;
    //
    // 		const failedValidations = path.validateRequestParameters({
    // 			query,
    // 			path: params,
    // 			headers,
    // 			cookies,
    // 			requestBody
    // 		});
    //
    // 		if(failedValidations.length)
    // 			return this.sendResponse(res, { errors: failedValidations }, 400);
    //
    // 		const preferHeader = req.header('prefer') || '';
    // 		const { example: preferredExampleName, statusCode: preferredStatusCode } = parsePreferHeader(preferHeader) || {};
    //
    // 		if(preferredStatusCode)
    // 			logger.debug(`Searching requested response with status code ${preferredStatusCode}`);
    // 		else
    // 			logger.debug('Searching first response');
    //
    // 		const { statusCode, headers: responseHeaders, body } = path.getResponse(preferredStatusCode, preferredExampleName);
    //
    // 		return this.sendResponse(res, body, statusCode, responseHeaders);
    // 	});
    //
    // 	return uris.map(uri => {
    // 		return logger.info(`Handling route ${path.httpMethod.toUpperCase()} ${uri}`);
    // 	});
    // });
    //
    // app.all('*', this._notFoundHandler.bind(this));
    //
    // this.server = app.listen(this.port);
    //
    // this.server.on('listening', err => {
    //
    // 	if(err)
    // 		throw err;
    //
    // 	const realPort = this.server.address().port;
    //
    // 	logger.info(`Mocking API at ${realPort}`);
    // });
  }

  shutdown() {
    logger.debug("Closing express server...");
    this.server.close();
  }

  _loadBasePaths() {
    const basePaths = [
      ...new Set(
        this.servers.map(({ url }) => url.pathname.replace(/\/+$/, ""))
      ),
    ];

    if (basePaths.length)
      logger.debug(`Found the following base paths: ${basePaths.join(", ")}`);

    this.basePaths = basePaths.length ? basePaths : [""];
  }

  _checkContentType(req) {
    const contentType = req.headers["content-type"];
    if (!contentType)
      logger.warn(`${colors.yellow("*")} Missing content-type header`);
  }

  _notFoundHandler(req) {
    const validPaths = [];
    for (const { httpMethod, uri: schemaUri } of this.paths) {
      const uri = this._normalizeExpressPath(schemaUri);

        validPaths.push(`${httpMethod.toUpperCase()} ${uri}`);
    }

    return this.sendResponse(
      {
        message: `Path not found: ${req.originalUrl}`,
        paths: validPaths,
      },
      400
    );
  }

  _normalizeExpressPath(schemaUri) {
    const normalizedPath = schemaUri
      .replace(/{([a-z0-9_?]+)}/gi, ":$1")
      .replace(/^\/*/, "/");

    return normalizedPath;
    // return this.basePaths.map((basePath) => `${basePath}${normalizedPath}`);
  }

  sendResponse(body, statusCode, headers) {
    statusCode = statusCode || 200;
    headers = headers || {};

    const color = statusCode < 400 ? colors.green : colors.red;

    logger.info(`${color("<")} [${statusCode}] ${JSON.stringify(body)}`);

    return {
      status: statusCode,
      headers: {
        ...headers,
        "x-powered-by": "jormaechea/open-api-mock",
      },
      body: JSON.stringify(body),
    };
  }
}

module.exports = Server;