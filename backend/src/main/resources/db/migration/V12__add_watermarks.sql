-- Watermark 기반 증분 처리: 마지막 처리 기준값 저장
CREATE TABLE IF NOT EXISTS etl_watermarks (
    job_id          UUID         NOT NULL,
    node_id         VARCHAR(100) NOT NULL,
    watermark_key   VARCHAR(100) NOT NULL,
    watermark_value VARCHAR(255),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (job_id, node_id, watermark_key)
);
