-- schedule_step_id를 nullable로 변경하고 ON DELETE SET NULL 적용
-- (스케줄 수정 시 기존 step이 삭제돼도 실행 이력은 보존)
ALTER TABLE schedule_step_executions
    DROP CONSTRAINT schedule_step_executions_schedule_step_id_fkey;

ALTER TABLE schedule_step_executions
    ALTER COLUMN schedule_step_id DROP NOT NULL;

ALTER TABLE schedule_step_executions
    ADD CONSTRAINT schedule_step_executions_schedule_step_id_fkey
    FOREIGN KEY (schedule_step_id) REFERENCES schedule_steps(id) ON DELETE SET NULL;
