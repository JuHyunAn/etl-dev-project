import React from "react";
import { NavLink, useLocation } from "react-router-dom";

const navItems = [
  {
    to: "/",
    exact: true,
    icon: (
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
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
        />
      </svg>
    ),
    label: "Dashboard",
  },
  {
    to: "/projects",
    icon: (
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
    ),
    label: "Projects",
  },
  {
    to: "/connections",
    icon: (
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
          d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
        />
      </svg>
    ),
    label: "Connections",
  },
  {
    to: "/executions",
    icon: (
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
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
    ),
    label: "Runs",
  },
];

export default function Sidebar() {
  const location = useLocation();

  return (
    <aside
      className="w-[220px] flex-shrink-0 flex flex-col h-full"
      style={{ background: "#232b37", borderRight: "1px solid #1a2d47" }}
    >
      {/* Logo */}
      <div
        className="px-4 pt-5 pb-4"
        style={{ borderBottom: "1px solid #1a2d47" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{
              background: "linear-gradient(135deg, #4f82f7 0%, #7c3aed 100%)",
              boxShadow: "0 0 12px rgba(79,130,247,0.3)",
            }}
          >
            <svg
              className="w-4 h-4 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 6h16M4 10h16M4 14h10M4 18h6"
              />
            </svg>
          </div>
          <div>
            <p
              className="text-sm font-bold leading-none"
              style={{ color: "#dde8f8", letterSpacing: "0.01em" }}
            >
              ETL Studio
            </p>
            <p
              className="text-[10px] mt-0.5 font-medium uppercase tracking-widest"
              style={{ color: "#3d5573" }}
            >
              Data Pipeline
            </p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
        <p
          className="text-[10px] font-semibold uppercase tracking-widest px-2 mb-2"
          style={{ color: "#3d5573" }}
        >
          Workspace
        </p>
        {navItems.map((item) => {
          const isActive = item.exact
            ? location.pathname === item.to
            : location.pathname.startsWith(item.to);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 group relative"
              style={
                isActive
                  ? { background: "#162644", color: "#6b97ff" }
                  : { color: "#6b7fa8" }
              }
              onMouseEnter={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = "#111e35";
                  (e.currentTarget as HTMLElement).style.color = "#b0c4e8";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = "";
                  (e.currentTarget as HTMLElement).style.color = "#6b7fa8";
                }
              }}
            >
              {isActive && (
                <div
                  className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full"
                  style={{ width: 3, height: 20, background: "#4f82f7" }}
                />
              )}
              <span style={{ color: isActive ? "#4f82f7" : "#3d5573" }}>
                {item.icon}
              </span>
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4" style={{ borderTop: "1px solid #1a2d47" }}>
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
            style={{
              background: "linear-gradient(135deg, #4f82f7 0%, #7c3aed 100%)",
            }}
          >
            E
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="text-xs font-medium truncate"
              style={{ color: "#adc3e0" }}
            >
              ETL Workspace
            </p>
            <p className="text-[10px]" style={{ color: "#3d5573" }}>
              v0.1.0
            </p>
          </div>
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{
              background: "#22c55e",
              boxShadow: "0 0 6px rgba(34,197,94,0.5)",
            }}
          />
        </div>
      </div>
    </aside>
  );
}
