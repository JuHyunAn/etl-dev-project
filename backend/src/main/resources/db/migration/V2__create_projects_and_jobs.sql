CREATE TABLE IF NOT EXISTS projects (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL,
    description VARCHAR(500) NOT NULL DEFAULT '',
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS folders (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_id   UUID         REFERENCES folders(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jobs (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    folder_id   UUID         REFERENCES folders(id) ON DELETE SET NULL,
    name        VARCHAR(100) NOT NULL,
    description VARCHAR(500) NOT NULL DEFAULT '',
    version     VARCHAR(10)  NOT NULL DEFAULT '0.1',
    status      VARCHAR(20)  NOT NULL DEFAULT 'DRAFT'
                CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
    ir_json     JSONB        NOT NULL DEFAULT '{}',
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_project_id ON jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_folders_project_id ON folders(project_id);
