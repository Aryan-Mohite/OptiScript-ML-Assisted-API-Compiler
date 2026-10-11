-- OptiScript demo database: SCHEMA only.
-- Running this file always gives empty, fresh tables (it drops first), so
-- "reset" is simply: run schema.sql, then data.sql.
--
-- The DSL's "IN <name>" / "INTO <name>" is the TABLE name, so these tables
-- are named like the ones in the sample programs. Columns are NULLable on
-- purpose: an OptiScript INSERT sets only the one field in its WHERE clause.

DROP TABLE IF EXISTS library_db;
DROP TABLE IF EXISTS authors_db;
DROP TABLE IF EXISTS members_db;

CREATE TABLE library_db (
  id     INT AUTO_INCREMENT PRIMARY KEY,
  title  VARCHAR(255) NULL,
  author VARCHAR(255) NULL,
  year   INT NULL
);

CREATE TABLE authors_db (
  id   INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NULL
);

CREATE TABLE members_db (
  id    INT AUTO_INCREMENT PRIMARY KEY,
  name  VARCHAR(255) NULL,
  email VARCHAR(255) NULL
);
