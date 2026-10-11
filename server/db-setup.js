/**
 * server/db-setup.js — `npm run db:setup`
 * Creates the demo database and loads db/schema.sql + db/data.sql.
 * Running it again resets everything back to the sample data.
 */

'use strict';

const { setupDatabase, getConfig } = require('./dbRunner');

setupDatabase()
  .then(() => console.log(`Database "${getConfig().database}" is ready (schema + sample data loaded).`))
  .catch((err) => {
    const c = getConfig();
    console.error(`DB setup failed: ${err.message}`);
    console.error(`Tried ${c.user}@${c.host}:${c.port}. Is MySQL running? Check DB_* in .env (see .env.example).`);
    process.exit(1);
  });
