CREATE TABLE IF NOT EXISTS executions (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID         NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    job_version     VARCHAR(10)  NOT NULL,
    status          VARCHAR(20)  NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','RUNNING','SUCCESS','FAILED','SKIPPED')),
    preview_mode    BOOLEAN      NOT NULL DEFAULT FALSE,
    started_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    finished_at     TIMESTAMP,
    duration_ms     BIGINT,
    node_results    JSONB        NOT NULL DEFAULT '{}',
    error_message   TEXT,
    logs            TEXT[],
    triggered_by    VARCHAR(100) DEFAULT 'manual'
);

CREATE INDEX IF NOT EXISTS idx_executions_job_id   ON executions(job_id);
CREATE INDEX IF NOT EXISTS idx_executions_status   ON executions(status);
CREATE INDEX IF NOT EXISTS idx_executions_started  ON executions(started_at DESC);
