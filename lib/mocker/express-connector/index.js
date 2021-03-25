'use strict';

/* istanbul ignore file */

// const bodyParser = require('body-parser');
// const cors = require('cors');
// const cookieParser = require('cookie-parser');
const logger = require('lllog')();
const colors = require('colors');
const parsePreferHeader = require('parse-prefer-header');
const memoize = require('micro-memoize');
const {
	create: createDynamicMiddleware
} = require('express-dynamic-middleware');
const { Router: createRouter } = require('express');

const openApiMockSymbol = Symbol('openApiMock');

class ExpressConnectorServer {
	constructor(app) {
		this.app = app;
		this.servers = [];
		this.paths = [];
		this.middleware = createDynamicMiddleware([]);
		this.app.use(this.middleware.handle());
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
		this.middleware.clean();
		const router = createRouter();
		this.middleware.use(router);

		router.all('*', (req, res, next) => {
			res[openApiMockSymbol] = {
				initTime: Date.now()
			};

			logger.info(`${colors.yellow('>')} [${req.method}] ${req.originalUrl}`);

			next();
		});

		// this.app.use(
		// 	cookieParser(),
		// 	cors({
		// 		origin: true,
		// 		credentials: true
		// 	}),
		// 	bodyParser.json(),
		// 	bodyParser.urlencoded({ limit: '50mb', extended: false, parameterLimit: 50000 }),
		// 	bodyParser.text(),
		// 	bodyParser.raw()
		// );

		this._loadBasePaths();

		this.paths.map(path => {
			logger.debug(
				`Processing schema path ${path.httpMethod.toUpperCase()} ${path.uri}`
			);

			const expressHttpMethod = path.httpMethod.toLowerCase();

			const uris = this._normalizeExpressPath(path.uri);

			// Create a function that is memoized using the URL, query, the Prefer header and the body.
			// eslint-disable-next-line no-unused-vars
			const getResponse = (url, query, preferHeader, body) => {
				const {
					example: preferredExampleName,
					statusCode: preferredStatusCode
				} = parsePreferHeader(preferHeader) || {};

				if(preferredStatusCode) {
					logger.debug(
						`Searching requested response with status code ${preferredStatusCode}`
					);
				} else logger.debug('Searching first response');
				return path.getResponse(preferredStatusCode, preferredExampleName);
			};

			const getResponseMemo = memoize(getResponse, {
				maxSize: 10
			});

			router[expressHttpMethod](uris, (req, res) => {
				this._checkContentType(req);

				const {
					query, params, headers, cookies, body: requestBody
				} = req;

				const failedValidations = path.validateRequestParameters({
					query,
					path: params,
					headers,
					cookies,
					requestBody
				});

				if(failedValidations.length)
					return this.sendResponse(res, { errors: failedValidations }, 400);

				const preferHeader = req.header('prefer') || '';

				const { statusCode, headers: responseHeaders, body } = getResponseMemo(
					req.path,
					JSON.stringify(req.query),
					preferHeader,
					JSON.stringify(requestBody)
				);

				return this.sendResponse(res, body, statusCode, responseHeaders);
			});

			return uris.map(uri => {
				return logger.info(
					`Handling route ${path.httpMethod.toUpperCase()} ${uri}`
				);
			});
		});

		router.all('*', this._notFoundHandler.bind(this));
	}

	shutdown() {
		this.middleware.clean();
	}

	_loadBasePaths() {
		const basePaths = [
			...new Set(
				this.servers.map(({ url }) => url.pathname.replace(/\/+$/, ''))
			)
		];

		if(basePaths.length)
			logger.debug(`Found the following base paths: ${basePaths.join(', ')}`);

		this.basePaths = basePaths.length ? basePaths : [''];
	}

	_checkContentType(req) {
		const contentType = req.header('content-type');
		if(!contentType)
			logger.warn(`${colors.yellow('*')} Missing content-type header`);
	}

	_notFoundHandler(req, res) {
		const validPaths = [];
		for(const { httpMethod, uri: schemaUri } of this.paths) {
			const uris = this._normalizeExpressPath(schemaUri);

			for(const uri of uris)
				validPaths.push(`${httpMethod.toUpperCase()} ${uri}`);
		}

		return this.sendResponse(
			res,
			{
				message: `Path not found: ${req.originalUrl}`,
				paths: validPaths
			},
			400
		);
	}

	_normalizeExpressPath(schemaUri) {
		const normalizedPath = schemaUri
			.replace(/\{([a-z0-9_]+)\}/gi, ':$1')
			.replace(/^\/*/, '/');

		return this.basePaths.map(basePath => `${basePath}${normalizedPath}`);
	}

	sendResponse(res, body, statusCode, headers) {
		statusCode = statusCode || 200;
		headers = headers || {};

		const responseTime = Date.now() - res[openApiMockSymbol].initTime;

		const color = statusCode < 400 ? colors.green : colors.red;

		logger.info(
			`${color('<')} [${statusCode}] ${JSON.stringify(
				body
			)} (${responseTime} ms)`
		);

		res
			.status(statusCode)
			.set(headers)
			.set('x-powered-by', 'jormaechea/open-api-mock')
			.json(body);
	}
}

module.exports = ExpressConnectorServer;
