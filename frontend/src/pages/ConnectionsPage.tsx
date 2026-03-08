import React, { useEffect, useState } from "react";
import { connectionsApi } from "../api";
import { useAppStore } from "../stores";
import {
  Badge,
  Button,
  Card,
  Input,
  Select,
  Textarea,
  Modal,
  Spinner,
  EmptyState,
} from "../components/ui";
import type { Connection, ConnectionCreateRequest, DbType } from "../types";

const DB_DEFAULTS: Record<DbType, number> = {
  POSTGRESQL: 5432,
  ORACLE: 1521,
  MARIADB: 3306,
};

function ConnectionForm({
  initial,
  onSave,
  onClose,
}: {
  initial?: Connection;
  onSave: (data: ConnectionCreateRequest) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<ConnectionCreateRequest>({
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    dbType: initial?.dbType ?? "POSTGRESQL",
    host: initial?.host ?? "",
    port: initial?.port ?? 5432,
    database: initial?.database ?? "",
    schema: initial?.schema ?? "",
    username: initial?.username ?? "",
    password: "",
    sslEnabled: initial?.sslEnabled ?? false,
    jdbcUrlOverride: initial?.jdbcUrlOverride ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (key: keyof ConnectionCreateRequest, value: unknown) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!form.name || !form.host || !form.database || !form.username) {
      setError("Name, Host, Database, Username are required");
      return;
    }
    if (!initial && !form.password) {
      setError("Password is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = { ...form };
      if (!payload.schema) delete payload.schema;
      if (!payload.jdbcUrlOverride) delete payload.jdbcUrlOverride;
      await onSave(payload);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-4">
      {error && (
        <div
          className="p-3 rounded-lg text-sm"
          style={{
            background: "#2a0f0f",
            border: "1px solid #3a1515",
            color: "#f87070",
          }}
        >
          {error}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Input
            label="Connection Name *"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Production DW"
          />
        </div>
        <div className="col-span-2">
          <Textarea
            label="Description"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Optional description"
            rows={2}
          />
        </div>
        <Select
          label="Database Type *"
          value={form.dbType}
          onChange={(e) => {
            const t = e.target.value as DbType;
            set("dbType", t);
            set("port", DB_DEFAULTS[t]);
          }}
        >
          <option value="POSTGRESQL">PostgreSQL</option>
          <option value="ORACLE">Oracle</option>
          <option value="MARIADB">MariaDB / MySQL</option>
        </Select>
        <Input
          label="Port *"
          type="number"
          value={form.port}
          onChange={(e) => set("port", parseInt(e.target.value))}
        />
        <Input
          label="Host *"
          value={form.host}
          onChange={(e) => set("host", e.target.value)}
          placeholder="localhost"
        />
        <Input
          label="Database *"
          value={form.database}
          onChange={(e) => set("database", e.target.value)}
          placeholder="my_database"
        />
        <Input
          label="Schema"
          value={form.schema ?? ""}
          onChange={(e) => set("schema", e.target.value)}
          placeholder="public"
        />
        <Input
          label="Username *"
          value={form.username}
          onChange={(e) => set("username", e.target.value)}
          placeholder="postgres"
        />
        <div className="col-span-2">
          <Input
            label={initial ? "Password (leave blank to keep)" : "Password *"}
            type="password"
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
            placeholder="••••••••"
          />
        </div>
        <div className="col-span-2">
          <Input
            label="JDBC URL Override (optional)"
            value={form.jdbcUrlOverride ?? ""}
            onChange={(e) => set("jdbcUrlOverride", e.target.value)}
            placeholder="jdbc:postgresql://..."
          />
        </div>
        <div className="col-span-2 flex items-center gap-2">
          <input
            type="checkbox"
            id="ssl"
            checked={form.sslEnabled}
            onChange={(e) => set("sslEnabled", e.target.checked)}
            className="w-4 h-4 accent-[#58a6ff]"
          />
          <label htmlFor="ssl" className="text-sm text-[#8b949e]">
            Enable SSL
          </label>
        </div>
      </div>
      <div
        className="flex justify-end gap-2 pt-2"
        style={{ borderTop: "1px solid #1a2d47" }}
      >
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSubmit} disabled={saving}>
          {saving ? <Spinner size="sm" /> : null}
          {initial ? "Update" : "Create"}
        </Button>
      </div>
    </div>
  );
}

export default function ConnectionsPage() {
  const { connections, setConnections, upsertConnection, removeConnection } =
    useAppStore();
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Connection | null>(null);
  const [testResults, setTestResults] = useState<
    Record<string, { success: boolean; message: string; durationMs: number }>
  >({});
  const [testing, setTesting] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    connectionsApi
      .list()
      .then(setConnections)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (data: ConnectionCreateRequest) => {
    if (editing) {
      const updated = await connectionsApi.update(editing.id, data);
      upsertConnection(updated);
    } else {
      const created = await connectionsApi.create(data);
      upsertConnection(created);
    }
    setEditing(null);
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    try {
      const result = await connectionsApi.test(id);
      setTestResults((prev) => ({ ...prev, [id]: result }));
    } catch (e) {
      setTestResults((prev) => ({
        ...prev,
        [id]: {
          success: false,
          message: e instanceof Error ? e.message : "Error",
          durationMs: 0,
        },
      }));
    } finally {
      setTesting(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this connection?")) return;
    setDeleting(id);
    try {
      await connectionsApi.delete(id);
      removeConnection(id);
    } finally {
      setDeleting(null);
    }
  };

  const dbTypeColor: Record<string, "blue" | "purple" | "success"> = {
    POSTGRESQL: "blue",
    ORACLE: "purple",
    MARIADB: "success",
  };

  return (
    <div className="h-full overflow-y-auto" style={{ background: "#ffffff" }}>
      <div
        className="px-6 py-5"
        style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}
      >
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" style={{ color: "#0f172a" }}>
              Connections
            </h1>
            <p className="text-sm mt-0.5" style={{ color: "#64748b" }}>
              Manage database connections
            </p>
          </div>
          <Button
            variant="primary"
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            New Connection
          </Button>
        </div>
      </div>
      <div className="px-6 py-5">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* List */}
          {loading ? (
            <div className="flex justify-center py-16">
              <Spinner size="lg" />
            </div>
          ) : connections.length === 0 ? (
            <Card>
              <EmptyState
                icon={
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                    />
                  </svg>
                }
                title="No connections yet"
                description="Add a database connection to get started"
                action={
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setShowForm(true)}
                  >
                    Add Connection
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {connections.map((conn) => {
                const testResult = testResults[conn.id];
                return (
                  <Card key={conn.id} className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-bold"
                          style={{
                            background:
                              conn.dbType === "POSTGRESQL"
                                ? "#eff6ff"
                                : conn.dbType === "ORACLE"
                                  ? "#faf5ff"
                                  : "#f0fdf4",
                            color:
                              conn.dbType === "POSTGRESQL"
                                ? "#2563eb"
                                : conn.dbType === "ORACLE"
                                  ? "#7c3aed"
                                  : "#16a34a",
                          }}
                        >
                          {conn.dbType === "POSTGRESQL"
                            ? "PG"
                            : conn.dbType === "ORACLE"
                              ? "ORA"
                              : "MY"}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className="text-sm font-medium"
                              style={{ color: "#0f172a" }}
                            >
                              {conn.name}
                            </span>
                            <Badge
                              variant={dbTypeColor[conn.dbType] ?? "default"}
                            >
                              {conn.dbType}
                            </Badge>
                            {conn.sslEnabled && (
                              <Badge variant="success">SSL</Badge>
                            )}
                          </div>
                          <p
                            className="text-xs mt-0.5"
                            style={{ color: "#64748b" }}
                          >
                            {conn.username}@{conn.host}:{conn.port}/
                            {conn.database}
                            {conn.schema ? `/${conn.schema}` : ""}
                          </p>
                          {conn.description && (
                            <p
                              className="text-xs mt-0.5 truncate"
                              style={{ color: "#94a3b8" }}
                            >
                              {conn.description}
                            </p>
                          )}
                          {testResult && (
                            <div
                              className="flex items-center gap-1.5 mt-1.5 text-xs"
                              style={{
                                color: testResult.success
                                  ? "#22c55e"
                                  : "#f87070",
                              }}
                            >
                              <span>{testResult.success ? "✓" : "✗"}</span>
                              <span>{testResult.message}</span>
                              {testResult.success && (
                                <span style={{ color: "#3d5573" }}>
                                  ({testResult.durationMs}ms)
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={testing === conn.id}
                          onClick={() => handleTest(conn.id)}
                        >
                          {testing === conn.id ? (
                            <Spinner size="sm" />
                          ) : (
                            <svg
                              className="w-3.5 h-3.5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                          )}
                          Test
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditing(conn);
                            setShowForm(true);
                          }}
                        >
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                          </svg>
                          Edit
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={deleting === conn.id}
                          onClick={() => handleDelete(conn.id)}
                        >
                          {deleting === conn.id ? (
                            <Spinner size="sm" />
                          ) : (
                            <svg
                              className="w-3.5 h-3.5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          )}
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      <Modal
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditing(null);
        }}
        title={editing ? "Edit Connection" : "New Connection"}
        size="lg"
      >
        <ConnectionForm
          initial={editing ?? undefined}
          onSave={handleSave}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
        />
      </Modal>
    </div>
  );
}
