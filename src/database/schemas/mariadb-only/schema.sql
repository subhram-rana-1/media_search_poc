-- Schema for the MariaDB-only POC model.
-- All media metadata and tags are stored fully in MariaDB.
-- Search is performed via SQL WHERE / scoring queries.

CREATE DATABASE IF NOT EXISTS media_search;
USE media_search;

-- Core media table
CREATE TABLE IF NOT EXISTS media (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  media_url     VARCHAR(2048)  NOT NULL,
  visual_qa_score FLOAT        NOT NULL DEFAULT 0,
  created_at    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_media_url (media_url(512))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tags associated with each media item
CREATE TABLE IF NOT EXISTS media_tags (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  media_id         BIGINT UNSIGNED NOT NULL,
  tag_name         VARCHAR(255)   NOT NULL,
  tag_type         ENUM('FIXED','FREE_TEXT') NOT NULL,
  tag_value        VARCHAR(1024)  NOT NULL DEFAULT '',
  tag_values_json  JSON,                        -- stores the `values` array
  confidence_level ENUM('LOW','MEDIUM','HIGH') NOT NULL DEFAULT 'MEDIUM',
  CONSTRAINT fk_mt_media FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE,
  INDEX idx_mt_media_id (media_id),
  INDEX idx_mt_tag_name (tag_name),
  INDEX idx_mt_tag_value (tag_value(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
