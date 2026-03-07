import React from "react";
import { Outlet, useLocation, useNavigate, Link } from "react-router-dom";
import Sidebar from "./Sidebar";

function Breadcrumb() {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);

  const labels: Record<string, string> = {
    projects: "Projects",
    connections: "Connections",
    executions: "Runs",
    designer: "Job Designer",
  };

  if (segments.length === 0)
    return (
      <span className="text-sm text-[#e6edf3] font-medium">Dashboard</span>
    );

  return (
    <nav className="flex items-center gap-1.5 text-sm">
      <Link
        to="/"
        className="text-[#8b949e] hover:text-[#e6edf3] transition-colors"
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
              className="w-3 h-3 text-[#484f58]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
            {isLast ? (
              <span className="text-[#e6edf3] font-medium">{label}</span>
            ) : (
              <Link
                to={path}
                className="text-[#8b949e] hover:text-[#e6edf3] transition-colors"
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
    <div className="flex h-screen bg-[#0d1117] overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header
          className="h-12 flex-shrink-0 bg-[#161b27] border-b border-[#21262d]
          flex items-center px-6 gap-4"
        >
          <Breadcrumb />
          <div className="ml-auto flex items-center gap-3">
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md
              bg-[#0f2d1a] border border-[#1a4731]"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950] animate-pulse" />
              <span className="text-xs text-[#3fb950] font-medium">
                Backend Online
              </span>
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
