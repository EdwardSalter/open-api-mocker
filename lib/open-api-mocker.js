'use strict';

const jsonRefs = require('json-refs');
const ExpressServer = require('./mocker/express/server');

const { Parser: OpenApiParser } = require('./openapi');
const { Parser: ServersParser } = require('./servers');
const { Parser: PathsParser } = require('./paths');

class OpenApiMocker {
	static get defaultPort() {
		return 5000;
	}

	constructor({ port, server }) {
		this.server = server || new ExpressServer();
		this.port = port || this.constructor.defaultPort;
	}

	setSchema(schema) {
		this.schema = schema;
	}

	async validate() {
		const parsedSchemas = await jsonRefs.resolveRefs(this.schema);

		this.schema = parsedSchemas.resolved;

		const openApiParser = new OpenApiParser();
		const openapi = openApiParser.parse(this.schema);

		const serversParser = new ServersParser();
		const servers = serversParser.parse(this.schema);

		const pathsParser = new PathsParser();
		const paths = pathsParser.parse(this.schema);

		this.api = {
			openapi,
			servers,
			paths
		};
	}

	mock() {
		return this.server.setServers(this.api.servers).setPort(this.port)
			.setPaths(this.api.paths)
			.init();
	}

	shutdown() {
		return this.server.shutdown();
	}
}

module.exports = OpenApiMocker;
