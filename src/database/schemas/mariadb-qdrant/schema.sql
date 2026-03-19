-- Schema for the MariaDB + Qdrant POC model.
-- MariaDB stores lightweight metadata only (url, score, tag names).
-- Full vector embeddings + semantic search are handled by Qdrant.
-- The `qdrant_point_id` column links a MariaDB row to the Qdrant point.

CREATE DATABASE IF NOT EXISTS media_search;
USE media_search;

-- Core media table (metadata only — vectors live in Qdrant)
CREATE TABLE IF NOT EXISTS media_qdrant (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  media_url        VARCHAR(2048)  NOT NULL,
  visual_qa_score  FLOAT          NOT NULL DEFAULT 0,
  qdrant_point_id  VARCHAR(64)    NOT NULL COMMENT 'UUID used as Qdrant point ID',
  tag_names_json   JSON           COMMENT 'Denormalised list of tag names for quick display',
  created_at       TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_mq_media_url (media_url(512)),
  UNIQUE KEY uq_mq_qdrant_id (qdrant_point_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
