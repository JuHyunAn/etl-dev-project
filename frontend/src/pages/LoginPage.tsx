import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import axios from "axios";

// ── 모달 내부 뷰 타입 ──────────────────────────────────────────
type ModalView = "login" | "register" | "findId" | "findPassword";

// ── 다크 인풋 공통 컴포넌트 ───────────────────────────────────
function DarkInput({
  type = "text",
  placeholder,
  value,
  onChange,
  autoFocus,
}: {
  type?: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoFocus={autoFocus}
      className="w-full px-4 py-3 rounded-md text-sm outline-none"
      style={{
        background: "#2a2f3e",
        border: "1px solid #3a4050",
        color: "#e2e8f0",
        caretColor: "#4f82f7",
      }}
      onFocus={(e) => {
        e.currentTarget.style.border = "1px solid #4f82f7";
      }}
      onBlur={(e) => {
        e.currentTarget.style.border = "1px solid #3a4050";
      }}
    />
  );
}

// ── 로그인 뷰 ──────────────────────────────────────────────────
function LoginView({
  onClose,
  onSwitch,
}: {
  onClose: () => void;
  onSwitch: (v: ModalView) => void;
}) {
  const { setAuth } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("아이디/이메일과 비밀번호를 입력해주세요.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await axios.post(
        "http://localhost:8080/api/auth/login",
        { email, password },
        { withCredentials: true },
      );
      setAuth(res.data.accessToken, res.data.user);
      onClose();
      navigate("/", { replace: true });
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          "아이디 또는 비밀번호가 올바르지 않습니다.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {/* 이메일/ID — 계정 유형 레이블 포함 */}
      <div
        className="flex rounded-md overflow-hidden"
        style={{ border: "1px solid #3a4050" }}
      >
        <div
          className="flex items-center px-3 text-xs font-medium flex-shrink-0"
          style={{
            background: "#232836",
            color: "#94a3b8",
            borderRight: "1px solid #3a4050",
            minWidth: 76,
          }}
        >
          통합계정
        </div>
        <input
          type="text"
          placeholder="아이디 또는 이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
          className="flex-1 px-3 py-3 text-sm outline-none"
          style={{
            background: "#2a2f3e",
            color: "#e2e8f0",
            caretColor: "#4f82f7",
          }}
          onFocus={(e) => {
            (e.currentTarget.parentElement as HTMLElement).style.border =
              "1px solid #4f82f7";
          }}
          onBlur={(e) => {
            (e.currentTarget.parentElement as HTMLElement).style.border =
              "1px solid #3a4050";
          }}
        />
      </div>

      <DarkInput
        type="password"
        placeholder="비밀번호"
        value={password}
        onChange={setPassword}
      />

      {error && (
        <p className="text-xs text-center" style={{ color: "#f87171" }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 rounded-md text-sm font-semibold mt-1"
        style={{
          background: loading ? "#2d4fa0" : "#2563eb",
          color: "#fff",
          opacity: loading ? 0.8 : 1,
        }}
        onMouseEnter={(e) => {
          if (!loading)
            (e.currentTarget as HTMLElement).style.background = "#1d4ed8";
        }}
        onMouseLeave={(e) => {
          if (!loading)
            (e.currentTarget as HTMLElement).style.background = "#2563eb";
        }}
      >
        {loading ? "로그인 중..." : "로그인"}
      </button>

      <div className="flex items-center justify-center gap-4 pt-1">
        {(
          [
            { label: "계정 찾기", view: "findId" as ModalView },
            { label: "비밀번호 찾기", view: "findPassword" as ModalView },
            { label: "회원가입", view: "register" as ModalView },
          ] as const
        ).map((item, i) => (
          <React.Fragment key={item.view}>
            {i > 0 && <span style={{ color: "#3a4050" }}>|</span>}
            <button
              type="button"
              onClick={() => onSwitch(item.view)}
              className="text-xs"
              style={{ color: "#94a3b8" }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.color = "#e2e8f0")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.color = "#94a3b8")
              }
            >
              {item.label}
            </button>
          </React.Fragment>
        ))}
      </div>
    </form>
  );
}

// ── 회원가입 뷰 ────────────────────────────────────────────────
function RegisterView({ onSwitch }: { onSwitch: (v: ModalView) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) {
      setError("모든 항목을 입력해주세요.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }
    if (password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await axios.post("http://localhost:8080/api/auth/register", {
        name,
        email,
        password,
      });
      setDone(true);
    } catch (err: any) {
      setError(err?.response?.data?.message || "회원가입에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 py-4">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center"
          style={{ background: "#1a3a2a" }}
        >
          <svg
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="#22c55e"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>
            회원가입 완료!
          </p>
          <p className="text-xs mt-1" style={{ color: "#94a3b8" }}>
            등록된 이메일로 로그인해주세요.
          </p>
        </div>
        <button
          onClick={() => onSwitch("login")}
          className="px-6 py-2 rounded-md text-sm font-medium"
          style={{ background: "#2563eb", color: "#fff" }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLElement).style.background = "#1d4ed8")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLElement).style.background = "#2563eb")
          }
        >
          로그인 화면으로
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <DarkInput placeholder="이름" value={name} onChange={setName} autoFocus />
      <DarkInput
        type="email"
        placeholder="이메일"
        value={email}
        onChange={setEmail}
      />
      <DarkInput
        type="password"
        placeholder="비밀번호 (8자 이상)"
        value={password}
        onChange={setPassword}
      />
      <DarkInput
        type="password"
        placeholder="비밀번호 확인"
        value={passwordConfirm}
        onChange={setPasswordConfirm}
      />
      {error && (
        <p className="text-xs text-center" style={{ color: "#f87171" }}>
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 rounded-md text-sm font-semibold mt-1"
        style={{
          background: "#2563eb",
          color: "#fff",
          opacity: loading ? 0.8 : 1,
        }}
        onMouseEnter={(e) => {
          if (!loading)
            (e.currentTarget as HTMLElement).style.background = "#1d4ed8";
        }}
        onMouseLeave={(e) => {
          if (!loading)
            (e.currentTarget as HTMLElement).style.background = "#2563eb";
        }}
      >
        {loading ? "처리 중..." : "회원가입"}
      </button>
      <button
        type="button"
        onClick={() => onSwitch("login")}
        className="text-xs text-center"
        style={{ color: "#94a3b8" }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLElement).style.color = "#e2e8f0")
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLElement).style.color = "#94a3b8")
        }
      >
        ← 로그인으로 돌아가기
      </button>
    </form>
  );
}

// ── 계정/비밀번호 찾기 뷰 ─────────────────────────────────────
function FindView({
  type,
  onSwitch,
}: {
  type: "findId" | "findPassword";
  onSwitch: (v: ModalView) => void;
}) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await new Promise((r) => setTimeout(r, 800)); // TODO: 백엔드 연동
    setSent(true);
    setLoading(false);
  };

  const desc =
    type === "findId"
      ? "가입 시 사용한 이메일을 입력하면 계정 정보를 안내해 드립니다."
      : "가입 시 사용한 이메일을 입력하면 비밀번호 재설정 링크를 발송합니다.";

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-4 py-4">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center"
          style={{ background: "#1a2d47" }}
        >
          <svg
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="#4f82f7"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>
            이메일을 발송했습니다
          </p>
          <p className="text-xs mt-1" style={{ color: "#94a3b8" }}>
            {email} 을 확인해주세요.
          </p>
        </div>
        <button
          onClick={() => onSwitch("login")}
          className="px-6 py-2 rounded-md text-sm font-medium"
          style={{ background: "#2563eb", color: "#fff" }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLElement).style.background = "#1d4ed8")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLElement).style.background = "#2563eb")
          }
        >
          로그인 화면으로
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <p className="text-xs leading-relaxed" style={{ color: "#94a3b8" }}>
        {desc}
      </p>
      <DarkInput
        type="email"
        placeholder="이메일 주소"
        value={email}
        onChange={setEmail}
        autoFocus
      />
      <button
        type="submit"
        disabled={loading || !email.trim()}
        className="w-full py-3 rounded-md text-sm font-semibold mt-1"
        style={{
          background: "#2563eb",
          color: "#fff",
          opacity: !email.trim() || loading ? 0.6 : 1,
        }}
        onMouseEnter={(e) => {
          if (email.trim() && !loading)
            (e.currentTarget as HTMLElement).style.background = "#1d4ed8";
        }}
        onMouseLeave={(e) => {
          if (email.trim() && !loading)
            (e.currentTarget as HTMLElement).style.background = "#2563eb";
        }}
      >
        {loading ? "발송 중..." : "확인 이메일 발송"}
      </button>
      <button
        type="button"
        onClick={() => onSwitch("login")}
        className="text-xs text-center"
        style={{ color: "#94a3b8" }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLElement).style.color = "#e2e8f0")
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLElement).style.color = "#94a3b8")
        }
      >
        ← 로그인으로 돌아가기
      </button>
    </form>
  );
}

// ── 시스템 로그인 모달 ─────────────────────────────────────────
function SystemLoginModal({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<ModalView>("login");
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const viewTitle: Record<ModalView, string> = {
    login: "로그인",
    register: "회원가입",
    findId: "계정 찾기",
    findPassword: "비밀번호 찾기",
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        className="relative w-full rounded-xl shadow-2xl"
        style={{
          maxWidth: 400,
          background: "#1e2130",
          border: "1px solid #2a2f3e",
          margin: "0 16px",
        }}
      >
        {/* X 버튼 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded"
          style={{ color: "#64748b" }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLElement).style.color = "#e2e8f0")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLElement).style.color = "#64748b")
          }
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        <div className="px-8 py-8">
          {/* 로고 */}
          <div className="flex flex-col items-center mb-6">
            <img
              src="/wise.png"
              className="w-10 h-10 object-contain mb-2"
              alt="logo"
            />
            <p
              className="text-base font-bold"
              style={{ color: "#dde8f8", letterSpacing: "0.02em" }}
            >
              WISE ETL Studio
            </p>
            {/* <p className="text-[10px] mt-0.5 uppercase tracking-widest" style={{ color: '#3d5573' }}>Data Pipeline</p> */}
          </div>

          {view !== "login" && (
            <p
              className="text-sm font-semibold text-center mb-4"
              style={{ color: "#e2e8f0" }}
            >
              {viewTitle[view]}
            </p>
          )}

          {view === "login" && (
            <LoginView onClose={onClose} onSwitch={setView} />
          )}
          {view === "register" && <RegisterView onSwitch={setView} />}
          {(view === "findId" || view === "findPassword") && (
            <FindView type={view} onSwitch={setView} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── 메인 LoginPage ─────────────────────────────────────────────
export default function LoginPage() {
  const { loginAsGuest, user, loading } = useAuth();
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);

  // 이미 로그인된 경우 메인으로 리다이렉트
  useEffect(() => {
    if (!loading && user) {
      navigate('/', { replace: true });
    }
  }, [user, loading]);

  const handleGuest = () => {
    loginAsGuest();
    navigate("/", { replace: true });
  };

  return (
    <div
      className="flex items-center justify-center h-screen"
      style={{ background: "#232B37" }}
    >
      <div className="w-full max-w-sm">
        {/* 로고 */}
        <div className="flex flex-col items-center mb-8">
          <img
            src="/wisefull.png"
            className="w-13 h-13 object-contain mb-3"
            style={{ marginBottom: "25px" }}
            alt="logo"
          />
          <h1 className="text-xl font-bold" style={{ color: "#ffffff" }}>
            WISE ETL Studio
          </h1>
          {/* <p
            className="text-xs mt-1 uppercase tracking-widest font-medium"
            style={{ color: "#232B37" }}
          >
            Data Pipeline
          </p> */}
        </div>

        {/* 카드 */}
        <div
          className="rounded-xl shadow-sm overflow-hidden"
          style={{ background: "#ffffff", border: "1px solid #e2e8f0" }}
        >
          <div className="px-8 py-6 flex flex-col gap-3">
            {/* 시스템 로그인 버튼 */}
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center justify-center gap-2.5 w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
              style={{ background: "#1268b3", color: "#ffffff" }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "#1268b3")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "#1268b3")
              }
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
                  strokeWidth={1.8}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
              시스템 로그인
            </button>

            {/* 구분선 */}
            <div className="flex items-center gap-3 my-1">
              <div className="flex-1 h-px" style={{ background: "#e2e8f0" }} />
              <span className="text-xs" style={{ color: "#94a3b8" }}>
                소셜 계정으로 로그인
              </span>
              <div className="flex-1 h-px" style={{ background: "#e2e8f0" }} />
            </div>

            {/* GitHub */}
            <button
              onClick={() => {
                window.location.href =
                  "http://localhost:8080/oauth2/authorization/github";
              }}
              className="flex items-center justify-center gap-2.5 w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
              style={{ background: "#24292e", color: "#ffffff" }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "#1a1f24")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "#24292e")
              }
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              GitHub으로 계속하기
            </button>

            {/* Google */}
            <button
              onClick={() => {
                window.location.href =
                  "http://localhost:8080/oauth2/authorization/google";
              }}
              className="flex items-center justify-center gap-2.5 w-full px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors"
              style={{
                background: "#ffffff",
                color: "#374151",
                border: "1px solid #d1d5db",
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "#f9fafb")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "#ffffff")
              }
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
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
              Google로 계속하기
            </button>
          </div>

          {/* 하단 Guest 입장 */}
          <div
            className="px-8 py-3 flex items-center justify-between"
            style={{ background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}
          >
            <span className="text-[11px]" style={{ color: "#94a3b8" }}>
              로그인 없이 둘러보기
            </span>
            <button
              onClick={handleGuest}
              className="text-xs font-medium flex items-center gap-1"
              style={{ color: "#2563eb" }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.color = "#1d4ed8")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.color = "#2563eb")
              }
            >
              Guest 입장
              <svg
                className="w-3 h-3"
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
          </div>
        </div>
      </div>

      {/* 시스템 로그인 모달 */}
      {modalOpen && <SystemLoginModal onClose={() => setModalOpen(false)} />}
    </div>
  );
}
