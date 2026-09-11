'use strict';

module.exports = {
  mongodb: {
    url: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/wellframe",
    databaseName: process.env.DB_NAME || "wellframe",
  },
  migrationsDir: "migrations",
  changelogCollectionName: "changelog",
  migrationFileExtension: ".js",
  useFileHash: false,
  moduleSystem: "commonjs",
};
