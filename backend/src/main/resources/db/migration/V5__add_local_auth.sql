-- 시스템 자체 계정(이메일/비밀번호) 지원을 위한 password_hash 컬럼 추가
-- provider = 'local' 인 사용자에게만 값이 들어가며, OAuth 사용자는 NULL

ALTER TABLE users ADD COLUMN password_hash VARCHAR(255);
