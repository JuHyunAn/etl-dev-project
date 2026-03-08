import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { projectsApi } from "../api";
import { useAppStore } from "../stores";
import {
  Badge,
  Button,
  Card,
  Input,
  Textarea,
  Modal,
  Spinner,
  EmptyState,
} from "../components/ui";
import type { Project } from "../types";

function ProjectForm({
  initial,
  onSave,
  onClose,
}: {
  initial?: Project;
  onSave: (data: { name: string; description: string }) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({ name: name.trim(), description });
      onClose();
    } catch (e) {
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
      <Input
        label="Project Name *"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Sales DW Pipeline"
        autoFocus
      />
      <Textarea
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="What does this project do?"
        rows={3}
      />
      <div
        className="flex justify-end gap-2 pt-2"
        style={{ borderTop: "1px solid #1a2d47" }}
      >
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSubmit} disabled={saving}>
          {saving ? <Spinner size="sm" /> : null}
          {initial ? "Update" : "Create Project"}
        </Button>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const navigate = useNavigate();
  const { projects, setProjects, upsertProject, removeProject } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    projectsApi
      .list()
      .then(setProjects)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (data: { name: string; description: string }) => {
    if (editing) {
      const updated = await projectsApi.update(editing.id, data);
      upsertProject(updated);
    } else {
      const created = await projectsApi.create(data);
      upsertProject(created);
    }
    setEditing(null);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this project and all its jobs?")) return;
    setDeleting(id);
    try {
      await projectsApi.delete(id);
      removeProject(id);
    } finally {
      setDeleting(null);
    }
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
              Projects
            </h1>
            <p className="text-sm mt-0.5" style={{ color: "#64748b" }}>
              Organize your ETL pipelines
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
            New Project
          </Button>
        </div>
      </div>
      <div className="px-6 py-5">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Grid */}
          {loading ? (
            <div className="flex justify-center py-16">
              <Spinner size="lg" />
            </div>
          ) : projects.length === 0 ? (
            <Card>
              <EmptyState
                icon={
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                    />
                  </svg>
                }
                title="No projects yet"
                description="Create a project to organize your ETL jobs"
                action={
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setShowForm(true)}
                  >
                    Create Project
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((p) => (
                <Card
                  key={p.id}
                  className="p-5 group"
                  onClick={() => navigate(`/projects/${p.id}`)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center"
                      style={{
                        background:
                          "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
                        color: "#2563eb",
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
                          strokeWidth={1.5}
                          d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                        />
                      </svg>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing(p);
                          setShowForm(true);
                        }}
                        className="p-1.5 rounded-md transition-colors"
                        style={{ color: "#4d6b8a" }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.color =
                            "#adc3e0";
                          (e.currentTarget as HTMLElement).style.background =
                            "#111e35";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.color =
                            "#4d6b8a";
                          (e.currentTarget as HTMLElement).style.background =
                            "";
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
                      </button>
                      <button
                        onClick={(e) => handleDelete(p.id, e)}
                        disabled={deleting === p.id}
                        className="p-1.5 rounded-md transition-colors"
                        style={{ color: "#4d6b8a" }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.color =
                            "#f87070";
                          (e.currentTarget as HTMLElement).style.background =
                            "#2a0f0f";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.color =
                            "#4d6b8a";
                          (e.currentTarget as HTMLElement).style.background =
                            "";
                        }}
                      >
                        {deleting === p.id ? (
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
                      </button>
                    </div>
                  </div>
                  <h3
                    className="text-sm font-semibold transition-colors"
                    style={{ color: "#0f172a" }}
                  >
                    {p.name}
                  </h3>
                  {p.description && (
                    <p
                      className="text-xs mt-1 line-clamp-2"
                      style={{ color: "#64748b" }}
                    >
                      {p.description}
                    </p>
                  )}
                  <div
                    className="mt-3 pt-3 flex items-center justify-between"
                    style={{ borderTop: "1px solid #e2e8f0" }}
                  >
                    <span
                      className="text-xs tabular-nums"
                      style={{ color: "#94a3b8" }}
                    >
                      Updated {new Date(p.updatedAt).toLocaleDateString()}
                    </span>
                    <svg
                      className="w-3.5 h-3.5 transition-colors"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      style={{ color: "#94a3b8" }}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditing(null);
        }}
        title={editing ? "Edit Project" : "New Project"}
      >
        <ProjectForm
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
