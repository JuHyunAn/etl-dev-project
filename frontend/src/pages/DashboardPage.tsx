import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { projectsApi, connectionsApi } from "../api";
import { useAppStore } from "../stores";
import { Badge, Button, Card, Spinner } from "../components/ui";
import type { Project, Connection } from "../types";

function StatCard({
  label,
  value,
  icon,
  accentColor,
  dimColor,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  accentColor: string;
  dimColor: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: "#94a3b8" }}
          >
            {label}
          </p>
          <p
            className="text-3xl font-bold mt-2 tabular-nums"
            style={{ color: accentColor }}
          >
            {value}
          </p>
        </div>
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: dimColor, color: accentColor }}
        >
          {icon}
        </div>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { projects, setProjects, connections, setConnections } = useAppStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([projectsApi.list(), connectionsApi.list()])
      .then(([p, c]) => {
        setProjects(p);
        setConnections(c);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" />
      </div>
    );

  return (
    <div className="h-full overflow-y-auto" style={{ background: "#f0f4f8" }}>
      {/* Welcome Banner */}
      <div
        className="px-8 py-6"
        style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}
      >
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold" style={{ color: "#0f172a" }}>
                Overview
              </h1>
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                style={{
                  background: "#eff6ff",
                  color: "#2563eb",
                  border: "1px solid #bfdbfe",
                }}
              >
                Beta
              </span>
            </div>
            <p className="text-sm" style={{ color: "#64748b" }}>
              Visual ETL Pipeline — SQL Pushdown Engine
            </p>
          </div>
          <Button
            variant="primary"
            onClick={() => navigate("/projects")}
            size="md"
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

      <div className="px-8 py-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              label="Projects"
              value={projects.length}
              accentColor="#2563eb"
              dimColor="#eff6ff"
              icon={
                <svg
                  className="w-5 h-5"
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
              }
            />
            <StatCard
              label="Connections"
              value={connections.length}
              accentColor="#22c55e"
              dimColor="#0a2518"
              icon={
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                  />
                </svg>
              }
            />
            <StatCard
              label="Engine"
              value="SQL"
              accentColor="#a78bfa"
              dimColor="#1a1040"
              icon={
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              }
            />
          </div>

          {/* Data cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Recent Projects */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div
                    className="w-1.5 h-4 rounded-full"
                    style={{ background: "#2563eb" }}
                  />
                  <h2
                    className="text-sm font-semibold"
                    style={{ color: "#0f172a" }}
                  >
                    Recent Projects
                  </h2>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/projects")}
                >
                  View all →
                </Button>
              </div>
              {projects.length === 0 ? (
                <div className="text-center py-8">
                  <div
                    className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center"
                    style={{
                      background: "#f1f5f9",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      style={{ color: "#94a3b8" }}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                      />
                    </svg>
                  </div>
                  <p className="text-sm mb-3" style={{ color: "#94a3b8" }}>
                    No projects yet
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => navigate("/projects")}
                  >
                    Create Project
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {projects.slice(0, 4).map((p) => (
                    <div
                      key={p.id}
                      onClick={() => navigate(`/projects/${p.id}`)}
                      className="flex items-center justify-between p-3 rounded-lg cursor-pointer group transition-all"
                      style={{
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor =
                          "#93c5fd";
                        (e.currentTarget as HTMLElement).style.background =
                          "#f0f7ff";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor =
                          "#e2e8f0";
                        (e.currentTarget as HTMLElement).style.background =
                          "#f8fafc";
                      }}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: "#eff6ff", color: "#2563eb" }}
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
                              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                            />
                          </svg>
                        </div>
                        <span
                          className="text-sm truncate"
                          style={{ color: "#0f172a" }}
                        >
                          {p.name}
                        </span>
                      </div>
                      <span
                        className="text-xs flex-shrink-0 ml-2 tabular-nums"
                        style={{ color: "#94a3b8" }}
                      >
                        {new Date(p.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Connections */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div
                    className="w-1.5 h-4 rounded-full"
                    style={{ background: "#22c55e" }}
                  />
                  <h2
                    className="text-sm font-semibold"
                    style={{ color: "#0f172a" }}
                  >
                    Connections
                  </h2>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/connections")}
                >
                  View all →
                </Button>
              </div>
              {connections.length === 0 ? (
                <div className="text-center py-8">
                  <div
                    className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center"
                    style={{
                      background: "#f1f5f9",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      style={{ color: "#94a3b8" }}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                      />
                    </svg>
                  </div>
                  <p className="text-sm mb-3" style={{ color: "#94a3b8" }}>
                    No connections yet
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => navigate("/connections")}
                  >
                    Add Connection
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {connections.slice(0, 4).map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between p-3 rounded-lg"
                      style={{
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <DbIcon dbType={c.dbType} />
                        <div className="min-w-0">
                          <span
                            className="text-sm truncate block"
                            style={{ color: "#0f172a" }}
                          >
                            {c.name}
                          </span>
                          <span
                            className="text-xs"
                            style={{ color: "#94a3b8" }}
                          >
                            {c.host}:{c.port}
                          </span>
                        </div>
                      </div>
                      <Badge
                        variant={
                          c.dbType === "POSTGRESQL"
                            ? "blue"
                            : c.dbType === "ORACLE"
                              ? "purple"
                              : "success"
                        }
                      >
                        {c.dbType}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Pipeline flow diagram */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <div
                className="w-1.5 h-4 rounded-full"
                style={{ background: "#7c3aed" }}
              />
              <h2
                className="text-sm font-semibold"
                style={{ color: "#0f172a" }}
              >
                Architecture
              </h2>
            </div>
            <div
              className="flex items-center gap-3 flex-wrap"
              style={{ color: "#94a3b8" }}
            >
              개발중
              <p className="text-xs ml-auto" style={{ color: "#94a3b8" }}>
                Zero data movement on web server
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function DbIcon({ dbType }: { dbType: string }) {
  const styles: Record<string, { bg: string; color: string; label: string }> = {
    POSTGRESQL: { bg: "#eff6ff", color: "#2563eb", label: "PG" },
    ORACLE: { bg: "#faf5ff", color: "#7c3aed", label: "ORA" },
    MARIADB: { bg: "#f0fdf4", color: "#16a34a", label: "MY" },
  };
  const s = styles[dbType] ?? {
    bg: "#f1f5f9",
    color: "#64748b",
    label: dbType[0],
  };
  return (
    <div
      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-[10px] font-bold"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </div>
  );
}
