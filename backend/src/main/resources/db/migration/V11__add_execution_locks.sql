-- 동시 실행 방지: 동일 job_id가 실행 중일 때 중복 기동 차단
CREATE TABLE IF NOT EXISTS etl_execution_locks (
    job_id      UUID         PRIMARY KEY,
    locked_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    instance_id VARCHAR(200) NOT NULL
);
