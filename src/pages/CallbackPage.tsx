import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { exchangeCode } from "../services/api";

export default function CallbackPage() {
  const navigate = useNavigate();
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const error = params.get("error");

    if (error || !code) {
      navigate("/?error=oauth_failed");
      return;
    }

    exchangeCode(code)
      .then((data) => {
        if (data.success && data.token) {
          localStorage.setItem("music_token", data.token);
          navigate("/servers");
        } else {
          navigate("/?error=token_failed");
        }
      })
      .catch(() => {
        navigate("/?error=network_failed");
      });
  }, [navigate]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
      }}
    >
      <div className="spinner" style={{ width: 40, height: 40 }} />
      <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
        Discord 인증 처리 중...
      </p>
    </div>
  );
}
