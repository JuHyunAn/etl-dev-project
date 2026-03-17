import React from "react";
import { Outlet, useLocation, useNavigate, Link } from "react-router-dom";
import Sidebar from "./Sidebar";

function Breadcrumb() {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);

  const labels: Record<string, string> = {
    projects: "Projects",
    connections: "Connections",
    executions: "Run history",
    designer: "Job Designer",
  };

  if (segments.length === 0)
    return (
      <span className="text-sm font-semibold" style={{ color: "#94a3b8" }}>
        Dashboard
      </span>
    );

  return (
    <nav className="flex items-center gap-1.5 text-sm">
      <Link
        to="/"
        className="transition-colors"
        style={{ color: "#94a3b8" }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLElement).style.color = "#475569")
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLElement).style.color = "#94a3b8")
        }
      >
        Home
      </Link>
      {segments.map((seg, i) => {
        const path = "/" + segments.slice(0, i + 1).join("/");
        const isLast = i === segments.length - 1;
        const label = labels[seg] ?? (seg.length === 36 ? "..." : seg);
        return (
          <React.Fragment key={path}>
            <svg
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              style={{ color: "#cbd5e1" }}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
            {isLast ? (
              <span className="font-semibold" style={{ color: "#94a3b8" }}>
                {label}
              </span>
            ) : (
              <Link
                to={path}
                className="transition-colors"
                style={{ color: "#94a3b8" }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.color = "#475569")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLElement).style.color = "#94a3b8")
                }
              >
                {label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

export default function AppLayout() {
  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: "#f0f4f8" }}
    >
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Gradient accent stripe */}
        <div
          className="h-[2px] flex-shrink-0"
          style={{
            background: "#0D1C29",
          }}
        />

        {/* Top Bar */}
        <header
          className="h-11 flex-shrink-0 flex items-center px-5 gap-4"
          style={{ background: "#0D1C29", borderBottom: "1px solid #0D1C29" }}
        >
          <Breadcrumb />
          <div className="ml-auto flex items-center gap-2">
            <button
              className="p-1.5 rounded-md transition-colors"
              style={{ color: "#94a3b8" }}
              title="Documentation"
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color = "#475569";
                (e.currentTarget as HTMLElement).style.background = "#f1f5f9";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color = "#94a3b8";
                (e.currentTarget as HTMLElement).style.background = "";
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
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
            </button>
            <button
              className="p-1.5 rounded-md transition-colors"
              style={{ color: "#94a3b8" }}
              title="Settings"
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color = "#475569";
                (e.currentTarget as HTMLElement).style.background = "#f1f5f9";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color = "#94a3b8";
                (e.currentTarget as HTMLElement).style.background = "";
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
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </button>
            <div className="w-px h-5 mx-1" style={{ background: "#e2e8f0" }} />
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                color: "#16a34a",
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
              Backend Online
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
