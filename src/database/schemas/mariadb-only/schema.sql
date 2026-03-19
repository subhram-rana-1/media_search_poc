-- Schema for POC Method 1: MariaDB-only media search
-- Requires MariaDB 11.7+ (native VECTOR support)

CREATE DATABASE IF NOT EXISTS media_search;
USE media_search;

-- Core media table (shared across ALL POC methods)
CREATE TABLE IF NOT EXISTS media (
    id              INT(11)        NOT NULL AUTO_INCREMENT,
    url             VARCHAR(512)   NOT NULL,
    visual_qa_score DECIMAL(5,2)   NOT NULL DEFAULT 0,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Fixed enum-like tags (e.g. time_of_day, env, wildlife)
-- confidence_level: 1=LOW, 2=MEDIUM, 3=HIGH (stored as TINYINT for index efficiency)
CREATE TABLE IF NOT EXISTS one_media_fixed_tag (
    id               INT(11)       NOT NULL AUTO_INCREMENT,
    media_id         INT(11)       NOT NULL,
    name             VARCHAR(256)  NOT NULL,
    value            VARCHAR(256)  NOT NULL,
    confidence_level TINYINT(1)    NOT NULL,
    PRIMARY KEY (id),
    INDEX idx_name_value_media (name, value, media_id),
    INDEX idx_media_id (media_id),
    FOREIGN KEY (media_id) REFERENCES media(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Free text tags with semantic embeddings (e.g. description, poi, city)
-- confidence_level: 1=LOW, 2=MEDIUM, 3=HIGH (stored as TINYINT for index efficiency)
CREATE TABLE IF NOT EXISTS one_media_free_text_tag (
    id               INT(11)       NOT NULL AUTO_INCREMENT,
    media_id         INT(11)       NOT NULL,
    name             VARCHAR(256)  NOT NULL,
    value            TEXT          NOT NULL,
    confidence_level TINYINT(1)    NOT NULL,
    embedding        VECTOR(1536)  NOT NULL,
    PRIMARY KEY (id),
    VECTOR INDEX idx_embedding (embedding),
    INDEX idx_media_id (media_id),
    FOREIGN KEY (media_id) REFERENCES media(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
