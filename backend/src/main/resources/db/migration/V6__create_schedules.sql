CREATE TABLE IF NOT EXISTS schedules (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name                VARCHAR(200) NOT NULL,
    description         TEXT,
    cron_expression     VARCHAR(100) NOT NULL,
    timezone            VARCHAR(50)  NOT NULL DEFAULT 'Asia/Seoul',
    enabled             BOOLEAN      NOT NULL DEFAULT false,

    -- Quartz 연동 키
    quartz_job_key      VARCHAR(200),
    quartz_trigger_key  VARCHAR(200),

    -- 운영 정보
    last_fired_at       TIMESTAMP,
    next_fire_at        TIMESTAMP,
    consecutive_failures INT         NOT NULL DEFAULT 0,

    -- 알림 설정
    alert_on_failure    BOOLEAN      NOT NULL DEFAULT true,
    alert_channel       VARCHAR(50),

    created_by          UUID         REFERENCES users(id),
    created_at          TIMESTAMP    NOT NULL DEFAULT now(),
    updated_at          TIMESTAMP    NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS schedule_steps (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id         UUID         NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    job_id              UUID         NOT NULL REFERENCES jobs(id),
    step_order          INT          NOT NULL,
    depends_on_step_id  UUID         REFERENCES schedule_steps(id),
    run_condition       VARCHAR(20)  NOT NULL DEFAULT 'ON_SUCCESS',
    timeout_seconds     INT          NOT NULL DEFAULT 3600,
    retry_count         INT          NOT NULL DEFAULT 0,
    retry_delay_seconds INT          NOT NULL DEFAULT 60,
    context_overrides   JSONB        NOT NULL DEFAULT '{}',
    enabled             BOOLEAN      NOT NULL DEFAULT true,
    UNIQUE (schedule_id, step_order)
);

CREATE TABLE IF NOT EXISTS schedule_executions (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id     UUID        NOT NULL REFERENCES schedules(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'RUNNING',
    started_at      TIMESTAMP   NOT NULL DEFAULT now(),
    finished_at     TIMESTAMP,
    total_steps     INT,
    completed_steps INT         NOT NULL DEFAULT 0,
    failed_steps    INT         NOT NULL DEFAULT 0,
    skipped_steps   INT         NOT NULL DEFAULT 0,
    trigger_type    VARCHAR(20) NOT NULL DEFAULT 'CRON',
    error_summary   TEXT
);

CREATE TABLE IF NOT EXISTS schedule_step_executions (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_execution_id   UUID        NOT NULL REFERENCES schedule_executions(id) ON DELETE CASCADE,
    schedule_step_id        UUID        NOT NULL REFERENCES schedule_steps(id),
    execution_id            UUID        REFERENCES executions(id),
    status                  VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    started_at              TIMESTAMP,
    finished_at             TIMESTAMP,
    retry_attempt           INT         NOT NULL DEFAULT 0,
    error_message           TEXT
);

CREATE INDEX IF NOT EXISTS idx_schedules_enabled        ON schedules(enabled);
CREATE INDEX IF NOT EXISTS idx_schedule_steps_schedule  ON schedule_steps(schedule_id, step_order);
CREATE INDEX IF NOT EXISTS idx_sche_exec_schedule       ON schedule_executions(schedule_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sche_step_exec_sche_exec ON schedule_step_executions(schedule_execution_id);
