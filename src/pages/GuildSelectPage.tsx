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
    if (!token) { navigate("/"); return; }

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
        if (!data.loggedIn) { localStorage.removeItem("music_token"); navigate("/"); return; }
        setGuilds((data.guilds as Guild[]).filter((g) => g.botInGuild));
        setLoading(false);
      })
      .catch(() => { setError("서버 목록을 불러오는데 실패했습니다."); setLoading(false); });
  }, [navigate]);

  return (
    <div className="guild-page">
      <header className="guild-header">
        <span className="guild-header-title">Music Dashboard</span>
        {user && (
          <div className="guild-user">
            <img src={getAvatarUrl(user.id, user.avatar)} alt="" className="guild-avatar" />
            <span className="guild-username">{user.global_name || user.username}</span>
            <button className="guild-logout" onClick={() => { localStorage.removeItem("music_token"); navigate("/"); }}>
              로그아웃
            </button>
          </div>
        )}
      </header>

      <main className="guild-main">
        <h1 className="guild-heading fade-in">서버를 선택하세요</h1>
        <p className="guild-subtitle fade-in">봇이 설치된 서버에서 음악을 제어할 수 있습니다</p>

        {loading && (
          <div className="guild-status"><div className="spinner" style={{ width: 28, height: 28 }} /></div>
        )}

        {error && (
          <div className="guild-status">
            <p className="guild-error-text">{error}</p>
            <button className="guild-retry" onClick={() => window.location.reload()}>다시 시도</button>
          </div>
        )}

        {!loading && !error && guilds.length === 0 && (
          <div className="guild-status">
            <p className="guild-empty-text">봇이 설치된 서버가 없습니다</p>
          </div>
        )}

        {!loading && guilds.length > 0 && (
          <div className="guild-grid fade-in">
            {guilds.map((guild) => (
              <button key={guild.id} className="guild-card" onClick={() => navigate(`/music/${guild.id}`)}>
                <div className="guild-card-icon">
                  <img
                    src={getGuildIconUrl(guild.id, guild.icon)}
                    alt={guild.name}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  <span className="guild-card-initial">{guild.name.charAt(0).toUpperCase()}</span>
                </div>
                <span className="guild-card-name truncate">{guild.name}</span>
                <div className="guild-card-meta">
                  {guild.memberCount?.toLocaleString() ?? "?"}명
                  {guild.owner && <span className="guild-card-owner">소유자</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
