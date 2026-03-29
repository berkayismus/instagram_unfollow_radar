/**
 * PostgreSQL connection pool.
 * Uses DATABASE_URL from environment (supports Postgres connection strings).
 */

'use strict';

const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Run a parameterised SQL query.
 * @param {string} text   - SQL with $1 $2 placeholders
 * @param {Array}  params
 * @returns {Promise<import('pg').QueryResult>}
 */
function query(text, params) {
    return pool.query(text, params);
}

module.exports = { query };
