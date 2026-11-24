'use strict';

require('dotenv').config();

function resolveDbName() {
  if (process.env.DB_NAME) return process.env.DB_NAME;
  const uri = process.env.MONGODB_URI || '';
  const match = uri.match(/\/([^/?]+)(?:\?|$)/);
  return (match && match[1]) ? match[1] : 'wellframe';
}

module.exports = {
  mongodb: {
    url: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/wellframe",
    databaseName: resolveDbName(),
  },
  migrationsDir: "migrations",
  changelogCollectionName: "changelog",
  migrationFileExtension: ".js",
  useFileHash: false,
  moduleSystem: "commonjs",
};
