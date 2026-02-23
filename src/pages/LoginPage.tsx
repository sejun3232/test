import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getAuthUrl } from "../services/api";
import "./LoginPage.css";

export default function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // API가 OAuth 처리 후 ?token=JWT 로 리다이렉트하면 자동 처리
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const err = params.get("error");

    if (token) {
      localStorage.setItem("music_token", token);
      // URL에서 토큰 파라미터 제거 후 서버 선택 화면으로 이동
      window.history.replaceState({}, "", "/");
      navigate("/servers");
      return;
    }

    if (err) {
      const messages: Record<string, string> = {
        oauth_failed: "Discord 인증에 실패했습니다.",
        token_failed: "토큰 발급에 실패했습니다.",
        network_failed: "서버에 연결할 수 없습니다.",
      };
      setError(messages[err] ?? "알 수 없는 오류가 발생했습니다.");
      window.history.replaceState({}, "", "/");
    }
  }, [navigate]);

  async function handleLogin() {
    setLoading(true);
    setError(null);
    try {
      const url = await getAuthUrl();
      window.location.href = url;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Failed to fetch") || msg.includes("network")) {
        setError("API 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요.");
      } else {
        setError("Discord 인증 URL을 가져오는데 실패했습니다. 다시 시도해주세요.");
      }
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-bg">
        <div className="login-orb orb1" />
        <div className="login-orb orb2" />
        <div className="login-orb orb3" />
      </div>

      <div className="login-card fade-in">
        <div className="login-logo">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
            <path
              d="M9 18V5l12-2v13"
              stroke="#5865f2"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="6" cy="18" r="3" fill="#5865f2" />
            <circle cx="18" cy="16" r="3" fill="#5865f2" opacity="0.6" />
          </svg>
        </div>

        <h1 className="login-title">Music Dashboard</h1>
        <p className="login-desc">
          Discord 서버의 음악을 웹에서 직접 제어하세요.
          <br />
          검색, 재생, 대기열 관리까지 한 곳에서.
        </p>

        <div className="login-features">
          <div className="login-feature">
            <span className="feature-icon">🎵</span>
            <span>실시간 음악 제어</span>
          </div>
          <div className="login-feature">
            <span className="feature-icon">🔍</span>
            <span>YouTube 검색</span>
          </div>
          <div className="login-feature">
            <span className="feature-icon">📋</span>
            <span>대기열 관리</span>
          </div>
        </div>

        {error && <div className="login-error">{error}</div>}

        <button
          className="login-btn"
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <>
              <div className="spinner" style={{ width: 20, height: 20 }} />
              <span>연결 중...</span>
            </>
          ) : (
            <>
              <svg width="24" height="24" viewBox="0 0 71 55" fill="white">
                <path d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.440769 45.4204 0.525289C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.525289C25.5141 0.443589 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9057 44.6363 54.2779 44.9293 54.6529 45.2082C54.7816 45.304 54.7732 45.5041 54.6333 45.5858C52.8646 46.6197 51.0259 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.038 50.6034 51.2554 52.5699 52.5959 54.435C52.6519 54.5139 52.7526 54.5477 52.845 54.5195C58.6464 52.7249 64.529 50.0174 70.6019 45.5576C70.6551 45.5182 70.6887 45.459 70.6943 45.3942C72.1747 30.0791 68.2147 16.7757 60.1968 4.9823C60.1772 4.9429 60.1437 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9 37.3253 47.3178 37.3253Z" />
              </svg>
              <span>Discord로 로그인</span>
            </>
          )}
        </button>

        <p className="login-footer">
          로그인 시{" "}
          <a href="https://discord.com/privacy" target="_blank" rel="noopener">
            Discord 개인정보처리방침
          </a>
          에 동의합니다.
        </p>
      </div>
    </div>
  );
}
