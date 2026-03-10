ALTER TABLE schedules
    ADD COLUMN IF NOT EXISTS alert_on_success    BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS alert_on_completion BOOLEAN NOT NULL DEFAULT false;
