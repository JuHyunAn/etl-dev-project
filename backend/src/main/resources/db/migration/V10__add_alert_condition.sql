ALTER TABLE schedules
    ADD COLUMN IF NOT EXISTS alert_condition VARCHAR(20) NOT NULL DEFAULT 'NONE';

-- 기존 boolean 데이터 마이그레이션
UPDATE schedules SET alert_condition = 'ON_FAILURE'
    WHERE alert_on_failure = true AND alert_condition = 'NONE';
