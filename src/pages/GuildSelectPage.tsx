import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getGuilds, getGuildIconUrl, decodeToken, getAvatarUrl } from "../services/api";
import type { Guild, User } from "../types";
import "./GuildSelectPage.css";

export default function GuildSelectPage() {
  const navigate = useNavigate();
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("music_token");
    if (!token) {
      navigate("/");
      return;
    }

    const decoded = decodeToken(token);
    if (decoded) {
      setUser({
        id: decoded.id,
        username: decoded.username,
        global_name: decoded.global_name || decoded.username,
        discriminator: decoded.discriminator,
        avatar: decoded.avatar || null,
      });
    }

    getGuilds(token)
      .then((data) => {
        if (!data.loggedIn) {
          localStorage.removeItem("music_token");
          navigate("/");
          return;
        }
        const botGuilds = (data.guilds as Guild[]).filter((g) => g.botInGuild);
        setGuilds(botGuilds);
        setLoading(false);
      })
      .catch(() => {
        setError("서버 목록을 불러오는데 실패했습니다.");
        setLoading(false);
      });
  }, [navigate]);

  function handleLogout() {
    localStorage.removeItem("music_token");
    navigate("/");
  }

  function handleSelectGuild(guild: Guild) {
    navigate(`/music/${guild.id}`);
  }

  return (
    <div className="guild-page">
      {/* Header */}
      <header className="guild-header">
        <div className="guild-header-logo">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M9 18V5l12-2v13" stroke="#5865f2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="6" cy="18" r="3" fill="#5865f2" />
            <circle cx="18" cy="16" r="3" fill="#5865f2" opacity="0.6" />
          </svg>
          <span>Music Dashboard</span>
        </div>

        {user && (
          <div className="guild-header-user">
            <img
              src={getAvatarUrl(user.id, user.avatar)}
              alt={user.username}
              className="user-avatar"
            />
            <span className="user-name">{user.global_name || user.username}</span>
            <button className="logout-btn" onClick={handleLogout} title="로그아웃">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              로그아웃
            </button>
          </div>
        )}
      </header>

      {/* Content */}
      <main className="guild-main">
        <div className="guild-hero fade-in">
          <h1>서버를 선택하세요</h1>
          <p>봇이 있는 서버에서 음악을 제어할 수 있습니다.</p>
        </div>

        {loading && (
          <div className="guild-loading">
            <div className="spinner" style={{ width: 36, height: 36 }} />
            <p>서버 목록 불러오는 중...</p>
          </div>
        )}

        {error && (
          <div className="guild-error">
            <p>{error}</p>
            <button onClick={() => window.location.reload()}>다시 시도</button>
          </div>
        )}

        {!loading && !error && guilds.length === 0 && (
          <div className="guild-empty">
            <div className="guild-empty-icon">🤖</div>
            <h3>봇이 있는 서버가 없습니다</h3>
            <p>봇을 서버에 초대한 후 다시 시도해주세요.</p>
          </div>
        )}

        {!loading && guilds.length > 0 && (
          <div className="guild-grid fade-in">
            {guilds.map((guild) => (
              <button
                key={guild.id}
                className="guild-card"
                onClick={() => handleSelectGuild(guild)}
              >
                <div className="guild-card-icon">
                  <img
                    src={getGuildIconUrl(guild.id, guild.icon)}
                    alt={guild.name}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <span className="guild-card-initial">
                    {guild.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="guild-card-info">
                  <div className="guild-card-name truncate">{guild.name}</div>
                  <div className="guild-card-meta">
                    <span className="guild-members">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                      </svg>
                      {guild.memberCount?.toLocaleString() ?? "?"}명
                    </span>
                    {guild.owner && (
                      <span className="guild-owner-badge">소유자</span>
                    )}
                  </div>
                </div>
                <div className="guild-card-arrow">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
