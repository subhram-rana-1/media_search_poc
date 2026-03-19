-- Schema for the MariaDB + Elasticsearch POC model.
-- MariaDB stores lightweight metadata only (url, score).
-- Full-text tag search is handled by Elasticsearch.
-- The `es_doc_id` column links a MariaDB row to the ES document.

CREATE DATABASE IF NOT EXISTS media_search;
USE media_search;

-- Core media table (metadata only — tag documents live in Elasticsearch)
CREATE TABLE IF NOT EXISTS media_elastic (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  media_url       VARCHAR(2048)  NOT NULL,
  visual_qa_score FLOAT          NOT NULL DEFAULT 0,
  es_doc_id       VARCHAR(64)    NOT NULL COMMENT 'Elasticsearch document ID',
  created_at      TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_me_media_url (media_url(512)),
  UNIQUE KEY uq_me_es_doc_id (es_doc_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Elasticsearch index mapping (media_tags index) --
-- Run this once against your ES cluster:
--
-- PUT /media_tags
-- {
--   "mappings": {
--     "properties": {
--       "mariadb_id":      { "type": "long" },
--       "media_url":       { "type": "keyword" },
--       "visual_qa_score": { "type": "float" },
--       "tags": {
--         "type": "nested",
--         "properties": {
--           "name":             { "type": "keyword" },
--           "type":             { "type": "keyword" },
--           "value":            { "type": "text", "fields": { "keyword": { "type": "keyword" } } },
--           "values":           { "type": "keyword" },
--           "confidence_level": { "type": "keyword" }
--         }
--       }
--     }
--   }
-- }
