-- Rollback: Personnel Pack v1.5 ISO 15189 extension
-- Drops all three new feature tables and the two supporting tables.
-- No effect on existing tables (Person, Competency, Training, SignOff, Prospect).

DROP TABLE IF EXISTS "Authorization";
DROP TABLE IF EXISTS "Procedure";
DROP TABLE IF EXISTS "ReviewEvent";
DROP TABLE IF EXISTS "DocumentVersion";
DROP TABLE IF EXISTS "Document";
