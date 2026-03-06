CREATE TABLE IF NOT EXISTS connections (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                VARCHAR(100) NOT NULL,
    description         VARCHAR(500) NOT NULL DEFAULT '',
    db_type             VARCHAR(20)  NOT NULL CHECK (db_type IN ('ORACLE','MARIADB','POSTGRESQL')),
    host                VARCHAR(255) NOT NULL,
    port                INTEGER      NOT NULL CHECK (port BETWEEN 1 AND 65535),
    database            VARCHAR(255) NOT NULL,
    schema              VARCHAR(255),
    username            VARCHAR(100) NOT NULL,
    password_encrypted  VARCHAR(512) NOT NULL,
    ssl_enabled         BOOLEAN      NOT NULL DEFAULT FALSE,
    jdbc_url_override   VARCHAR(1024),
    extra_props         TEXT,
    created_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_connections_db_type ON connections(db_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_connections_name ON connections(name);
