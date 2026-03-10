import React, { useState, useRef, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

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
    label: "Run history",
  },
  {
    to: "/schedules",
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
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    label: "Actions",
  },
];

export default function Sidebar() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const profileBtnRef = useRef<HTMLButtonElement>(null);
  const [popoverTop, setPopoverTop] = useState(0);

  // 외부 클릭 시 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        profileRef.current &&
        !profileRef.current.contains(e.target as Node)
      ) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleProfileToggle = () => {
    if (!profileOpen && profileBtnRef.current) {
      const rect = profileBtnRef.current.getBoundingClientRect();
      setPopoverTop(rect.top);
    }
    setProfileOpen((p) => !p);
  };

  const providerIcon = (provider: string) => {
    if (provider === "github")
      return (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
        </svg>
      );
    if (provider === "google")
      return (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
      );
    return null;
  };

  return (
    <aside
      className="w-[220px] flex-shrink-0 flex flex-col h-full"
      style={{ background: "#f6f6f6", borderRight: "1px solid #E2E8F0" }}
    >
      {/* Logo */}
      <div
        className="px-4 pt-5 pb-4"
        style={{ borderBottom: "1px solid #E2E8F0" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            // style={{
            //   background: "linear-gradient(135deg, #4f82f7 0%, #7c3aed 100%)",
            //   boxShadow: "0 0 12px rgba(79,130,247,0.3)",
            // }}
          >
            {/* <svg
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
            </svg> */}
            <img src="/wise.png" className="w-8 h-8 object-contain" />
          </div>
          <div>
            <p
              className="text-sm font-bold leading-none"
              style={{ color: "#206DB5", letterSpacing: "0.01em" }}
            >
              WISE ETL Studio
            </p>
            <p
              className="text-[10px] mt-0.5 font-medium uppercase tracking-widest"
              style={{ color: "#232B37" }}
            >
              Data Pipeline
            </p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav
        className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto"
        style={{ backgroundColor: "#f6f6f6" }}
      >
        {/* <p
          className="text-[10px] font-semibold uppercase tracking-widest px-2 mb-2"
          style={{ color: "#f6f6f6" }}
        >
          Workspace
        </p> */}
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
                  ? {
                      background: "#232B37",
                      color: "#f6f6f6",
                      fontWeight: "bold",
                    }
                  : { color: "#232B37" }
              }
              onMouseEnter={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = "#232B37";
                  (e.currentTarget as HTMLElement).style.color = "#f6f6f6";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = "";
                  (e.currentTarget as HTMLElement).style.color = "#232B37";
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

      {/* Footer - 프로필 버튼 */}
      <div ref={profileRef} style={{ borderTop: "1px solid #E2E8F0" }}>
        {/* Guest 모드: 로그인 유도 버튼 */}
        {user?.role === "GUEST" ? (
          <div className="px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: "#e2e8f0" }}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="#94a3b8"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
              </div>
              <div>
                <p
                  className="text-xs font-semibold"
                  style={{ color: "#232B37" }}
                >
                  Guest
                </p>
                <p className="text-[10px]" style={{ color: "#94a3b8" }}>
                  읽기 전용
                </p>
              </div>
            </div>
            <a
              href="/login"
              className="flex items-center justify-center w-full py-1.5 rounded-md text-xs font-medium transition-colors"
              style={{ background: "#232B37", color: "#f6f6f6" }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "#1a1f2a")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "#232B37")
              }
            >
              로그인 / 회원가입
            </a>
          </div>
        ) : user ? (
          <button
            ref={profileBtnRef}
            onClick={handleProfileToggle}
            className="w-full flex items-center gap-2.5 px-4 py-3.5 transition-colors text-left"
            style={{ background: profileOpen ? "#ebebeb" : undefined }}
            onMouseEnter={(e) => {
              if (!profileOpen)
                (e.currentTarget as HTMLElement).style.background = "#ebebeb";
            }}
            onMouseLeave={(e) => {
              if (!profileOpen)
                (e.currentTarget as HTMLElement).style.background = "";
            }}
          >
            {/* 아바타 */}
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0 relative"
              style={{
                background: "linear-gradient(135deg, #4f82f7 0%, #7c3aed 100%)",
              }}
            >
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                user.name.charAt(0).toUpperCase()
              )}
              {user.provider !== "local" && (
                <span
                  className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-white flex items-center justify-center"
                  style={{
                    color: user.provider === "github" ? "#24292e" : "#4285F4",
                  }}
                >
                  {providerIcon(user.provider)}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p
                className="text-xs font-semibold truncate uppercase tracking-wide"
                style={{ color: "#232B37" }}
              >
                {user.name}
              </p>
              <p className="text-[10px] truncate" style={{ color: "#64748b" }}>
                {user.email}
              </p>
            </div>
            <svg
              className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${profileOpen ? "rotate-180" : ""}`}
              style={{ color: "#94a3b8" }}
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
          </button>
        ) : (
          <div className="px-4 py-3">
            <a
              href="/login"
              className="flex items-center justify-center w-full py-1.5 rounded-md text-xs font-medium transition-colors"
              style={{ background: "#232B37", color: "#f6f6f6" }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "#1a1f2a")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "#232B37")
              }
            >
              로그인 / 회원가입
            </a>
          </div>
        )}

        {/* 팝오버 패널 */}
        {profileOpen && user && (
          <div
            className="fixed z-50 rounded-lg shadow-xl overflow-hidden"
            style={{
              left: 228,
              bottom: window.innerHeight - popoverTop - 47,
              width: 220,
              background: "#ffffff",
              border: "1px solid #e2e8f0",
            }}
          >
            {/* 유저 정보 */}
            <div
              className="px-4 py-3"
              style={{ borderBottom: "1px solid #f1f5f9" }}
            >
              <p
                className="text-xs font-bold uppercase tracking-wide"
                style={{ color: "#232B37" }}
              >
                {user.name}
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: "#64748b" }}>
                {user.email}
              </p>
              {user.provider !== "local" && (
                <div className="flex items-center gap-1 mt-1.5">
                  <span
                    style={{
                      color: user.provider === "github" ? "#24292e" : "#4285F4",
                    }}
                  >
                    {providerIcon(user.provider)}
                  </span>
                  <span className="text-[10px]" style={{ color: "#94a3b8" }}>
                    {user.provider === "github" ? "GitHub" : "Google"} 계정
                  </span>
                </div>
              )}
            </div>

            {/* 메뉴 */}
            <div className="py-1">
              {[
                {
                  label: "Your profile",
                  icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
                },
                {
                  label: "Account settings",
                  icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
                },
              ].map((item) => (
                <button
                  key={item.label}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-left transition-colors"
                  style={{ color: "#374151" }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.background =
                      "#f8fafc")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.background = "")
                  }
                >
                  <svg
                    className="w-3.5 h-3.5 flex-shrink-0"
                    style={{ color: "#94a3b8" }}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d={item.icon}
                    />
                  </svg>
                  {item.label}
                </button>
              ))}
            </div>

            {/* Sign out */}
            <div style={{ borderTop: "1px solid #f1f5f9" }}>
              <button
                onClick={async () => {
                  setProfileOpen(false);
                  await logout();
                }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-left transition-colors"
                style={{ color: "#dc2626" }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.background =
                    "#fef2f2")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLElement).style.background = "")
                }
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
                    strokeWidth={1.5}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
                Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
