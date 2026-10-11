-- OptiScript demo database: DATA only (sample rows).

INSERT INTO library_db (title, author, year) VALUES
  ('Dune',        'Frank Herbert',  1965),
  ('Neuromancer', 'William Gibson', 1984),
  ('The Hobbit',  'J.R.R. Tolkien', 1937);

INSERT INTO authors_db (name) VALUES
  ('Frank Herbert'),
  ('William Gibson'),
  ('J.R.R. Tolkien');

INSERT INTO members_db (name, email) VALUES
  ('Asha', 'asha@example.com'),
  ('Ravi', 'ravi@example.com');
