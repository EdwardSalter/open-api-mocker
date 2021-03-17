const YAML = require("js-yaml");
const fs = require("fs");
const OpenApiMocker = require("./lib/open-api-mocker");
const chokidar = require("chokidar");

const logger = require("lllog")();

let prev;
function loadSchemaFromDisk(schemaPath) {
  logger.debug(`Reading schema from ${schemaPath}`);

  // TODO: MOVE TO COMMON CODE
  if (schemaPath.match(/\.ya?ml$/)) {
    const contents = YAML.load(fs.readFileSync(schemaPath));
    if (prev) {
      console.log("File contents are the same?", contents === prev);
    }

    prev = contents;
    return contents;
  }

  delete require.cache[require.resolve(schemaPath)];
  return require(schemaPath); // eslint-disable-line global-require, import/no-dynamic-require
}

function notReadyHandler(req, res) {
  res.status(503).send("Server is still loading.");
}

/**
 * A function that must be called by the handler of the platform specific serveless function
 * @callback RequestHandler
 * @param {Object} req
 * @param {Object} res
 * @param {Function} next
 */

/**
 *
 * @param {Object} options
 * @param {string} [options.schemaPath] The path to a JSON/Yaml file that will be used as the schema
 * @param {Object} [options.schema] The full schema object already loaded via some other means
 * @param {Object} [options.watch] Whether to watch the given path for changes
 * @returns {RequestHandler}
 * @example
 * const connector = require("open-api-mocker/express-connector");
 *
 * // Initialise using schema directly
 * const schema = require("./schema.json");
 * let connect = connector({ schema });
 * // or initialise using file path
 * connect = connector({ schemaFile: "/some/path/to/schema/file.yml" });
 *
 * // The returned connect function is called passing in an existing express app.
 * // This could either be an app created using the express package (i.e. `const app = require("express")();`
 * // or it could be app created using a serverless wrapper for instance: `const app = require("serverless-express/express")()`
 *
 * const express = require("serverless-express/express");
 * const handle = require("serverless-express/handle");
 *
 * const app = express();
 * connect(app); // Connect the mock OpenAPI routes to this instance of express
 * module.exports = handle(app);
 */
function connector(options) {
  let { schema, watch, schemaPath } = options;
  let connected = false;
  let validating;
  let handle = notReadyHandler;
  let connectedApp;
  const server = new OpenApiMocker({
    port: undefined,
    server: "express-connector",
  });

  function connectToApp() {
    validating
      .then(() => {
        return server.mock();
      })
      .then((connector) => {
        connector(connectedApp);
        handle = (req, res, next) => {
          return next();
        };
      });
  }

  function load() {
    let schema = options.schema;
    if (!schema && schemaPath) schema = loadSchemaFromDisk(schemaPath);

    if (!schema) throw new Error("No schema loaded. Nothing can be served.");

    handle = notReadyHandler;

    server.setSchema(schema);
    validating = server.validate();

    if (connected) {
      return connectToApp();
    }
  }

  if (watch) {
    if (schema || !schemaPath) {
      throw new Error("Watch mode can only be used with schemaPath parameter");
    }

    chokidar.watch(schemaPath).on("change", () => {
      setTimeout(async () => {
        logger.info("Detected change in schema file; loading changes.");
        await load();
        logger.info("Watching changes...");
      }, 100);
    });
  }

  load();

  return {
    get schema() {
      return server.schema;
    },

    connect(app) {
      connected = true;
      connectedApp = app;

      app.use((req, res, next) => {
        handle(req, res, next);
      });

      return connectToApp();
    },
  };
}

module.exports = connector;