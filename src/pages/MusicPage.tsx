import {
  useEffect,
  useState,
  useRef,
  useCallback,
  type ChangeEvent,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  decodeToken, getAvatarUrl, getGuildIconUrl,
  getPlaylists, getPlaylistDetail, createPlaylist,
  deletePlaylistApi, addTracksToPlaylistApi, removeTrackFromPlaylistApi, renamePlaylist,
} from "../services/api";
import { musicWs } from "../services/websocket";
import type { MusicState, SearchResult, Playlist, PlaylistTrack } from "../types";
import "./MusicPage.css";

function formatTime(ms: number): string {
  if (!ms || ms <= 0) return "0:00";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

const DEFAULT_STATE: MusicState = {
  isPlaying: false,
  isPaused: false,
  queue: [],
  currentTrack: null,
  loopMode: "off",
  autoplay: false,
  volume: 100,
  position: 0,
};

export default function MusicPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const navigate = useNavigate();

  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [music, setMusic] = useState<MusicState>(DEFAULT_STATE);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [volumeLocal, setVolumeLocal] = useState(100);
  const [positionLocal, setPositionLocal] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [guildName, setGuildName] = useState<string>("");
  const [guildIcon, setGuildIcon] = useState<string | null>(null);
  const [user, setUser] = useState<{ id: string; username: string; global_name?: string; avatar?: string } | null>(null);

  // Playlist state
  const [sidebarTab, setSidebarTab] = useState<"queue" | "playlist">("queue");
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [expandedPlaylist, setExpandedPlaylist] = useState<Playlist | null>(null);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [addToPlaylistTrack, setAddToPlaylistTrack] = useState<PlaylistTrack | null>(null);

  const positionTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const notifTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotif = useCallback((msg: string) => {
    setNotification(msg);
    if (notifTimer.current) clearTimeout(notifTimer.current);
    notifTimer.current = setTimeout(() => setNotification(null), 3000);
  }, []);

  // Position ticker
  useEffect(() => {
    if (music.isPlaying && !isDragging) {
      positionTimer.current = setInterval(() => {
        setPositionLocal((p) => {
          const next = p + 1000;
          return music.currentTrack?.duration
            ? Math.min(next, music.currentTrack.duration)
            : next;
        });
      }, 1000);
    } else {
      if (positionTimer.current) clearInterval(positionTimer.current);
    }
    return () => {
      if (positionTimer.current) clearInterval(positionTimer.current);
    };
  }, [music.isPlaying, isDragging, music.currentTrack?.duration]);

  // Sync position from state
  useEffect(() => {
    if (!isDragging) setPositionLocal(music.position || 0);
  }, [music.position, isDragging]);

  // Sync volume
  useEffect(() => {
    setVolumeLocal(music.volume ?? 100);
  }, [music.volume]);

  // Playlist loader (must be defined before the main useEffect that uses it)
  const loadPlaylists = useCallback(async () => {
    const token = localStorage.getItem("music_token");
    if (!token) return;
    setPlaylistLoading(true);
    try {
      const res = await getPlaylists(token);
      if (res.success) setPlaylists(res.playlists);
    } finally {
      setPlaylistLoading(false);
    }
  }, []);

  // Auth + WS setup
  useEffect(() => {
    const token = localStorage.getItem("music_token");
    if (!token || !guildId) {
      navigate("/");
      return;
    }

    const decoded = decodeToken(token);
    if (!decoded) {
      navigate("/");
      return;
    }
    setUser(decoded as typeof user);

    // Store guild info from navigation state (if available)
    const state = window.history.state;
    if (state?.guildName) setGuildName(state.guildName);
    if (state?.guildIcon !== undefined) setGuildIcon(state.guildIcon);

    // Connect WebSocket
    musicWs
      .connect()
      .then(() => {
        setWsStatus("connected");
        musicWs.subscribe(guildId);
      })
      .catch(() => {
        setWsStatus("disconnected");
      });

    const offConnected = musicWs.on("connected", () => {
      setWsStatus("connected");
      musicWs.subscribe(guildId);
    });
    const offDisconnected = musicWs.on("disconnected", () => {
      setWsStatus("disconnected");
    });
    const offState = musicWs.on("STATE_UPDATE", (data) => {
      setMusic({
        isPlaying: data.isPlaying,
        isPaused: data.isPaused,
        queue: data.queue || [],
        currentTrack: data.currentTrack || null,
        loopMode: data.loopMode || "off",
        autoplay: data.autoplay || false,
        volume: data.volume ?? 100,
        position: data.position || 0,
      });
    });
    const offSearch = musicWs.on("SEARCH_RESULTS", (data) => {
      setSearchResults(data.results || []);
      setIsSearching(false);
    });
    const offError = musicWs.on("ERROR", (data) => {
      showNotif(`오류: ${data.message}`);
      setIsSearching(false);
    });

    loadPlaylists();

    return () => {
      offConnected();
      offDisconnected();
      offState();
      offSearch();
      offError();
      musicWs.disconnect();
    };
  }, [guildId, navigate, showNotif, loadPlaylists]);

  // Controls
  const handlePlayPause = () => {
    if (!guildId) return;
    if (music.isPlaying) musicWs.pause(guildId);
    else if (music.isPaused) musicWs.resume(guildId);
  };

  const handleSkip = () => guildId && musicWs.skip(guildId);
  const handleStop = () => guildId && musicWs.stop(guildId);

  const handleLoopCycle = () => {
    if (!guildId) return;
    const next = music.loopMode === "off" ? "track" : music.loopMode === "track" ? "queue" : "off";
    musicWs.setLoop(guildId, next);
  };

  const handleAutoplay = () => {
    if (!guildId) return;
    musicWs.setAutoplay(guildId, !music.autoplay);
  };

  const handleVolumeChange = (e: ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setVolumeLocal(v);
  };

  const handleVolumeCommit = () => {
    if (!guildId) return;
    musicWs.setVolume(guildId, volumeLocal);
  };

  const handleSeekChange = (e: ChangeEvent<HTMLInputElement>) => {
    setIsDragging(true);
    setPositionLocal(Number(e.target.value));
  };

  const handleSeekCommit = () => {
    setIsDragging(false);
    if (!guildId) return;
    musicWs.seek(guildId, positionLocal);
  };

  const handleRemoveTrack = (index: number) => {
    if (!guildId) return;
    musicWs.removeTrack(guildId, index);
  };

  const handleMoveUp = (index: number) => {
    if (!guildId || index <= 1) return;
    musicWs.moveTrack(guildId, index, index - 1);
  };

  const handleMoveDown = (index: number) => {
    if (!guildId || index >= music.queue.length - 1) return;
    musicWs.moveTrack(guildId, index, index + 1);
  };

  // Playlist

  const handleCreatePlaylist = async () => {
    const name = newPlaylistName.trim();
    if (!name) return;
    const token = localStorage.getItem("music_token");
    if (!token) return;
    const res = await createPlaylist(token, name);
    if (res.success) {
      setNewPlaylistName("");
      setIsCreatingPlaylist(false);
      loadPlaylists();
      showNotif(`플레이리스트 "${res.playlist.name}" 생성됨`);
    }
  };

  const handleDeletePlaylist = async (id: string, name: string) => {
    const token = localStorage.getItem("music_token");
    if (!token) return;
    const res = await deletePlaylistApi(token, id);
    if (res.success) {
      if (expandedPlaylist?.id === id) setExpandedPlaylist(null);
      loadPlaylists();
      showNotif(`"${name}" 삭제됨`);
    }
  };

  const handleExpandPlaylist = async (pl: Playlist) => {
    if (expandedPlaylist?.id === pl.id) { setExpandedPlaylist(null); return; }
    const token = localStorage.getItem("music_token");
    if (!token) return;
    const res = await getPlaylistDetail(token, pl.id);
    if (res.success) setExpandedPlaylist(res.playlist);
  };

  const handlePlayPlaylist = (pl: Playlist) => {
    if (!guildId || !user || !pl.tracks?.length) return;
    pl.tracks.forEach((t) => {
      musicWs.play(guildId, t.uri, user.id, user.global_name || user.username);
    });
    showNotif(`"${pl.name}" 전체 재생 추가됨 (${pl.tracks.length}곡)`);
    setSidebarTab("queue");
  };

  const handleAddTrackToPlaylist = async (playlistId: string, track: PlaylistTrack) => {
    const token = localStorage.getItem("music_token");
    if (!token) return;
    const res = await addTracksToPlaylistApi(token, playlistId, [track]);
    if (res.success) {
      showNotif("플레이리스트에 추가됨");
      setAddToPlaylistTrack(null);
      loadPlaylists();
    }
  };

  const handleRemoveTrackFromPlaylist = async (playlistId: string, index: number) => {
    const token = localStorage.getItem("music_token");
    if (!token) return;
    const res = await removeTrackFromPlaylistApi(token, playlistId, index);
    if (res.success && expandedPlaylist) {
      const updated = { ...expandedPlaylist, tracks: expandedPlaylist.tracks?.filter((_, i) => i !== index) };
      setExpandedPlaylist(updated);
      loadPlaylists();
    }
  };

  const handleRenamePlaylist = async (id: string) => {
    const name = renameValue.trim();
    if (!name) return;
    const token = localStorage.getItem("music_token");
    if (!token) return;
    const res = await renamePlaylist(token, id, name);
    if (res.success) {
      setRenamingId(null);
      loadPlaylists();
    }
  };

  // Search
  const handleSearchInput = (e: ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    searchTimer.current = setTimeout(() => {
      if (!guildId) return;
      setIsSearching(true);
      musicWs.search(guildId, q.trim());
    }, 600);
  };

  const handlePlaySearch = (result: SearchResult) => {
    if (!guildId || !user) return;
    musicWs.play(
      guildId,
      result.uri,
      user.id,
      user.global_name || user.username
    );
    setSearchQuery("");
    setSearchResults([]);
    showNotif(`재생 목록에 추가됨: ${result.title}`);
  };

  const loopIcon = music.loopMode === "track" ? "🔂" : music.loopMode === "queue" ? "🔁" : "🔁";
  const loopLabel = music.loopMode === "off" ? "반복 없음" : music.loopMode === "track" ? "한 곡 반복" : "전체 반복";
  const progress = music.currentTrack?.duration
    ? (positionLocal / music.currentTrack.duration) * 100
    : 0;

  const progressFill = `linear-gradient(to right, var(--accent) ${progress}%, rgba(255,255,255,0.1) ${progress}%)`;

  return (
    <div className="music-page">
      {/* Header */}
      <header className="music-header">
        <button className="back-btn" onClick={() => navigate("/servers")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          서버 선택
        </button>

        <div className="music-header-guild">
          {guildId && (
            <img
              src={getGuildIconUrl(guildId, guildIcon)}
              alt={guildName}
              className="guild-icon-sm"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}
          <span>{guildName || "Music Dashboard"}</span>
        </div>

        <div className="music-header-right">
          <div className={`ws-badge ${wsStatus}`}>
            <span className="ws-dot" />
            {wsStatus === "connected" ? "연결됨" : wsStatus === "connecting" ? "연결 중" : "연결 끊김"}
          </div>
          {user && (
            <img
              src={getAvatarUrl(user.id, user.avatar)}
              alt={user.username}
              className="user-avatar-sm"
            />
          )}
        </div>
      </header>

      {/* Notification */}
      {notification && (
        <div className="music-notif">{notification}</div>
      )}

      {/* Main Layout */}
      <div className="music-layout">
        {/* Left: Player */}
        <section className="music-player">
          {/* Album Art */}
          <div className="album-art-wrap">
            {music.currentTrack ? (
              <img
                key={music.currentTrack.thumbnail}
                src={music.currentTrack.thumbnail}
                alt={music.currentTrack.title}
                className="album-art"
              />
            ) : (
              <div className="album-art-placeholder">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
                  <path d="M9 18V5l12-2v13" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="6" cy="18" r="3" fill="rgba(255,255,255,0.15)" />
                  <circle cx="18" cy="16" r="3" fill="rgba(255,255,255,0.1)" />
                </svg>
              </div>
            )}
            {music.isPlaying && <div className="album-art-glow" />}
          </div>

          {/* Track Info */}
          <div className="track-info">
            {music.currentTrack ? (
              <>
                <div className="track-title truncate">{music.currentTrack.title}</div>
                <div className="track-artist truncate">{music.currentTrack.author}</div>
                <div className="track-meta-row">
                  {music.currentTrack.requestedBy && (
                    <div className="track-requested">
                      신청자: {music.currentTrack.requestedByName || `<@${music.currentTrack.requestedBy}>`}
                    </div>
                  )}
                  <button
                    className="save-to-playlist-btn"
                    title="플레이리스트에 저장"
                    onClick={() => {
                      if (!music.currentTrack) return;
                      setAddToPlaylistTrack({
                        title: music.currentTrack.title,
                        uri: music.currentTrack.uri,
                        author: music.currentTrack.author,
                        duration: music.currentTrack.duration,
                        thumbnail: music.currentTrack.thumbnail,
                      });
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
                      <polyline points="17 21 17 13 7 13 7 21" />
                      <polyline points="7 3 7 8 15 8" />
                    </svg>
                    저장
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="track-title" style={{ color: "var(--text-muted)" }}>재생 중인 곡 없음</div>
                <div className="track-artist">검색하거나 곡을 추가하세요</div>
              </>
            )}
          </div>

          {/* Progress Bar */}
          <div className="progress-section">
            <div className="progress-wrap">
              <input
                type="range"
                min={0}
                max={music.currentTrack?.duration || 1}
                value={positionLocal}
                onChange={handleSeekChange}
                onMouseUp={handleSeekCommit}
                onTouchEnd={handleSeekCommit}
                disabled={!music.currentTrack || music.currentTrack.isStream}
                style={{ background: progressFill }}
                className="progress-bar"
              />
            </div>
            <div className="progress-times">
              <span>{formatTime(positionLocal)}</span>
              <span>
                {music.currentTrack?.isStream
                  ? "LIVE"
                  : formatTime(music.currentTrack?.duration || 0)}
              </span>
            </div>
          </div>

          {/* Controls */}
          <div className="controls">
            <button
              className={`ctrl-btn loop-btn ${music.loopMode !== "off" ? "active" : ""}`}
              onClick={handleLoopCycle}
              title={loopLabel}
            >
              {loopIcon}
              <span className="ctrl-label">{loopLabel}</span>
            </button>

            <button
              className="ctrl-btn skip-btn"
              onClick={() => guildId && musicWs.play(guildId, "", user?.id || "", user?.global_name || "")}
              title="이전 (미지원)"
              disabled
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
              </svg>
            </button>

            <button
              className={`ctrl-btn play-btn ${music.isPlaying ? "playing" : ""}`}
              onClick={handlePlayPause}
              disabled={!music.currentTrack && !music.isPaused}
              title={music.isPlaying ? "일시정지" : "재생"}
            >
              {music.isPlaying ? (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            <button
              className="ctrl-btn skip-btn"
              onClick={handleSkip}
              disabled={music.queue.length === 0}
              title="다음 곡"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
              </svg>
            </button>

            <button
              className="ctrl-btn stop-btn"
              onClick={handleStop}
              disabled={!music.currentTrack && music.queue.length === 0}
              title="정지"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <rect x="4" y="4" width="16" height="16" rx="2" />
              </svg>
            </button>
          </div>

          {/* Volume + Autoplay */}
          <div className="secondary-controls">
            <div className="volume-control">
              <button
                className="vol-icon"
                onClick={() => {
                  const newVol = volumeLocal === 0 ? 50 : 0;
                  setVolumeLocal(newVol);
                  if (guildId) musicWs.setVolume(guildId, newVol);
                }}
              >
                {volumeLocal === 0 ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16.5 12A4.5 4.5 0 0014 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                  </svg>
                ) : volumeLocal < 50 ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                  </svg>
                )}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                value={volumeLocal}
                onChange={handleVolumeChange}
                onMouseUp={handleVolumeCommit}
                onTouchEnd={handleVolumeCommit}
                className="volume-slider"
                style={{
                  background: `linear-gradient(to right, var(--accent) ${volumeLocal}%, rgba(255,255,255,0.1) ${volumeLocal}%)`
                }}
              />
              <span className="vol-value">{volumeLocal}%</span>
            </div>

            <button
              className={`autoplay-btn ${music.autoplay ? "active" : ""}`}
              onClick={handleAutoplay}
              title="자동재생"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z" />
              </svg>
              자동재생
            </button>
          </div>
        </section>

        {/* Right: Sidebar */}
        <aside className="music-sidebar">
          {/* Tab switcher */}
          <div className="sidebar-tabs">
            <button
              className={`sidebar-tab ${sidebarTab === "queue" ? "active" : ""}`}
              onClick={() => setSidebarTab("queue")}
            >
              대기열
              {music.queue.length > 0 && <span className="tab-badge">{music.queue.length}</span>}
            </button>
            <button
              className={`sidebar-tab ${sidebarTab === "playlist" ? "active" : ""}`}
              onClick={() => { setSidebarTab("playlist"); loadPlaylists(); }}
            >
              플레이리스트
              {playlists.length > 0 && <span className="tab-badge">{playlists.length}</span>}
            </button>
          </div>

          {sidebarTab === "queue" && <>
            {/* Search */}
            <div className="search-section">
              <div className="search-wrap">
                <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="YouTube에서 검색..."
                  value={searchQuery}
                  onChange={handleSearchInput}
                  className="search-input"
                />
                {searchQuery && (
                  <button
                    className="search-clear"
                    onClick={() => { setSearchQuery(""); setSearchResults([]); }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>

              {isSearching && (
                <div className="search-loading">
                  <div className="spinner" style={{ width: 20, height: 20 }} />
                  <span>검색 중...</span>
                </div>
              )}

              {searchResults.length > 0 && (
                <div className="search-results">
                  {searchResults.map((result, i) => (
                    <button
                      key={result.uri || i}
                      className="search-result-item"
                      onClick={() => handlePlaySearch(result)}
                    >
                      <img
                        src={result.thumbnail}
                        alt={result.title}
                        className="search-thumb"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                      <div className="search-result-info">
                        <div className="search-result-title truncate">{result.title}</div>
                        <div className="search-result-meta">
                          {result.author} · {formatTime(result.duration)}
                        </div>
                      </div>
                      <div className="search-result-btns">
                        <button
                          className="search-save-btn"
                          title="플레이리스트에 저장"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAddToPlaylistTrack({
                              title: result.title,
                              uri: result.uri,
                              author: result.author,
                              duration: result.duration,
                              thumbnail: result.thumbnail,
                            });
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
                            <polyline points="17 21 17 13 7 13 7 21" />
                            <polyline points="7 3 7 8 15 8" />
                          </svg>
                        </button>
                        <div className="search-add-icon">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="16" />
                            <line x1="8" y1="12" x2="16" y2="12" />
                          </svg>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Queue */}
            <div className="queue-section" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div className="queue-header">
                <h3>
                  대기열
                  {music.queue.length > 0 && (
                    <span className="queue-count">{music.queue.length}</span>
                  )}
                </h3>
                {music.queue.length > 1 && (
                  <span className="queue-duration">
                    {formatTime(music.queue.slice(1).reduce((acc, t) => acc + t.duration, 0))} 남음
                  </span>
                )}
              </div>

              {music.queue.length === 0 ? (
                <div className="queue-empty">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                    <path d="M9 18V5l12-2v13" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="6" cy="18" r="3" fill="rgba(255,255,255,0.1)" />
                    <circle cx="18" cy="16" r="3" fill="rgba(255,255,255,0.08)" />
                  </svg>
                  <p>대기열이 비어있습니다</p>
                  <p className="queue-empty-sub">위에서 음악을 검색하세요</p>
                </div>
              ) : (
                <div className="queue-list">
                  {music.queue.map((track, i) => (
                    <div
                      key={`${track.uri}-${i}`}
                      className={`queue-item ${i === 0 ? "queue-item-current" : ""}`}
                    >
                      <div className="queue-item-pos">
                        {i === 0 ? (
                          <div className="now-playing-bars">
                            <span /><span /><span />
                          </div>
                        ) : (
                          <span className="queue-num">{i}</span>
                        )}
                      </div>

                      <img
                        src={track.thumbnail}
                        alt={track.title}
                        className="queue-thumb"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />

                      <div className="queue-item-info">
                        <div className="queue-item-title truncate">{track.title}</div>
                        <div className="queue-item-meta">
                          {track.author} · {track.isStream ? "LIVE" : formatTime(track.duration)}
                        </div>
                      </div>

                      <div className="queue-item-actions">
                        {i > 0 && (
                          <>
                            <button
                              className="queue-action-btn"
                              onClick={() => handleMoveUp(i)}
                              disabled={i <= 1}
                              title="위로"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <polyline points="18 15 12 9 6 15" />
                              </svg>
                            </button>
                            <button
                              className="queue-action-btn"
                              onClick={() => handleMoveDown(i)}
                              disabled={i >= music.queue.length - 1}
                              title="아래로"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <polyline points="6 9 12 15 18 9" />
                              </svg>
                            </button>
                          </>
                        )}
                        <button
                          className="queue-remove-btn"
                          onClick={() => handleRemoveTrack(i)}
                          title={i === 0 ? "스킵" : "제거"}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>}

          {/* Playlist Tab */}
          {sidebarTab === "playlist" && (
            <div className="playlist-panel">
              {/* Header */}
              <div className="playlist-panel-header">
                <span className="playlist-panel-title">내 플레이리스트</span>
                <button
                  className="pl-create-btn"
                  onClick={() => setIsCreatingPlaylist(true)}
                  title="새 플레이리스트"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              </div>

              {/* Create input */}
              {isCreatingPlaylist && (
                <div className="pl-create-form">
                  <input
                    autoFocus
                    className="pl-name-input"
                    placeholder="플레이리스트 이름"
                    value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleCreatePlaylist(); if (e.key === "Escape") { setIsCreatingPlaylist(false); setNewPlaylistName(""); } }}
                  />
                  <div className="pl-create-actions">
                    <button className="pl-confirm-btn" onClick={handleCreatePlaylist} disabled={!newPlaylistName.trim()}>만들기</button>
                    <button className="pl-cancel-btn" onClick={() => { setIsCreatingPlaylist(false); setNewPlaylistName(""); }}>취소</button>
                  </div>
                </div>
              )}

              {/* List */}
              {playlistLoading ? (
                <div className="pl-loading"><div className="spinner" style={{ width: 20, height: 20 }} /></div>
              ) : playlists.length === 0 ? (
                <div className="pl-empty">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                    <path d="M9 18V5l12-2v13" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="6" cy="18" r="3" fill="rgba(255,255,255,0.1)" />
                  </svg>
                  <p>플레이리스트가 없습니다</p>
                  <p className="pl-empty-sub">+ 버튼으로 만들어보세요</p>
                </div>
              ) : (
                <div className="pl-list">
                  {playlists.map((pl) => (
                    <div key={pl.id} className="pl-item">
                      <div className="pl-item-row" onClick={() => handleExpandPlaylist(pl)}>
                        <div className="pl-item-icon">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z" />
                          </svg>
                        </div>
                        <div className="pl-item-info">
                          {renamingId === pl.id ? (
                            <input
                              autoFocus
                              className="pl-rename-input"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") handleRenamePlaylist(pl.id); if (e.key === "Escape") setRenamingId(null); }}
                            />
                          ) : (
                            <span className="pl-item-name">{pl.name}</span>
                          )}
                          <span className="pl-item-count">{pl.trackCount}곡</span>
                        </div>
                        <div className="pl-item-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="pl-action-btn"
                            title="전체 재생"
                            onClick={() => { if (expandedPlaylist?.id === pl.id) handlePlayPlaylist(expandedPlaylist); else handleExpandPlaylist(pl).then?.(() => { }); }}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                          </button>
                          <button
                            className="pl-action-btn"
                            title="이름 변경"
                            onClick={() => { setRenamingId(pl.id); setRenameValue(pl.name); }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button
                            className="pl-delete-btn"
                            title="삭제"
                            onClick={() => handleDeletePlaylist(pl.id, pl.name)}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* Expanded tracks */}
                      {expandedPlaylist?.id === pl.id && (
                        <div className="pl-tracks">
                          {!expandedPlaylist.tracks?.length ? (
                            <p className="pl-tracks-empty">곡이 없습니다</p>
                          ) : (
                            <>
                              <button
                                className="pl-play-all-btn"
                                onClick={() => handlePlayPlaylist(expandedPlaylist)}
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                                전체 대기열에 추가 ({expandedPlaylist.tracks.length}곡)
                              </button>
                              {expandedPlaylist.tracks.map((track, idx) => (
                                <div key={idx} className="pl-track-item">
                                  <img
                                    src={track.thumbnail || ""}
                                    alt={track.title}
                                    className="pl-track-thumb"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                  />
                                  <div className="pl-track-info">
                                    <div className="pl-track-title truncate">{track.title}</div>
                                    <div className="pl-track-meta">{track.author} · {formatTime(track.duration)}</div>
                                  </div>
                                  <div className="pl-track-actions">
                                    <button
                                      className="pl-action-btn"
                                      title="대기열에 추가"
                                      onClick={() => {
                                        if (!guildId || !user) return;
                                        musicWs.play(guildId, track.uri, user.id, user.global_name || user.username);
                                        showNotif(`대기열에 추가: ${track.title}`);
                                      }}
                                    >
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                                    </button>
                                    <button
                                      className="pl-delete-btn"
                                      title="제거"
                                      onClick={() => handleRemoveTrackFromPlaylist(pl.id, idx)}
                                    >
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Add to playlist modal */}
          {addToPlaylistTrack && (
            <div className="pl-modal-overlay" onClick={() => setAddToPlaylistTrack(null)}>
              <div className="pl-modal" onClick={(e) => e.stopPropagation()}>
                <div className="pl-modal-title">플레이리스트에 추가</div>
                <p className="pl-modal-track">{addToPlaylistTrack.title}</p>
                {playlists.length === 0 ? (
                  <p className="pl-modal-empty">플레이리스트가 없습니다</p>
                ) : (
                  <div className="pl-modal-list">
                    {playlists.map((pl) => (
                      <button
                        key={pl.id}
                        className="pl-modal-item"
                        onClick={() => handleAddTrackToPlaylist(pl.id, addToPlaylistTrack)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z" />
                        </svg>
                        <span>{pl.name}</span>
                        <span className="pl-modal-count">{pl.trackCount}곡</span>
                      </button>
                    ))}
                  </div>
                )}
                <button className="pl-cancel-btn" onClick={() => setAddToPlaylistTrack(null)}>취소</button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
