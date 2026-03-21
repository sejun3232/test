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
  const [, setGuildName] = useState<string>("");
  const [guildIcon, setGuildIcon] = useState<string | null>(null);
  const [user, setUser] = useState<{ id: string; username: string; global_name?: string; avatar?: string } | null>(null);

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

  useEffect(() => {
    if (music.isPlaying && !isDragging) {
      positionTimer.current = setInterval(() => {
        setPositionLocal((p) => {
          const next = p + 1000;
          return music.currentTrack?.duration ? Math.min(next, music.currentTrack.duration) : next;
        });
      }, 1000);
    } else {
      if (positionTimer.current) clearInterval(positionTimer.current);
    }
    return () => { if (positionTimer.current) clearInterval(positionTimer.current); };
  }, [music.isPlaying, isDragging, music.currentTrack?.duration]);

  useEffect(() => { if (!isDragging) setPositionLocal(music.position || 0); }, [music.position, isDragging]);
  useEffect(() => { setVolumeLocal(music.volume ?? 100); }, [music.volume]);

  const loadPlaylists = useCallback(async () => {
    const token = localStorage.getItem("music_token");
    if (!token) return;
    setPlaylistLoading(true);
    try { const res = await getPlaylists(token); if (res.success) setPlaylists(res.playlists); } finally { setPlaylistLoading(false); }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("music_token");
    if (!token || !guildId) { navigate("/"); return; }
    const decoded = decodeToken(token);
    if (!decoded) { navigate("/"); return; }
    setUser(decoded as typeof user);
    const state = window.history.state;
    if (state?.guildName) setGuildName(state.guildName);
    if (state?.guildIcon !== undefined) setGuildIcon(state.guildIcon);

    musicWs.connect()
      .then(() => { setWsStatus("connected"); musicWs.subscribe(guildId); })
      .catch(() => { setWsStatus("disconnected"); });

    const offConnected = musicWs.on("connected", () => { setWsStatus("connected"); musicWs.subscribe(guildId); });
    const offDisconnected = musicWs.on("disconnected", () => { setWsStatus("disconnected"); });
    const offState = musicWs.on("STATE_UPDATE", (data) => {
      setMusic({ isPlaying: data.isPlaying, isPaused: data.isPaused, queue: data.queue || [], currentTrack: data.currentTrack || null, loopMode: data.loopMode || "off", autoplay: data.autoplay || false, volume: data.volume ?? 100, position: data.position || 0 });
    });
    const offSearch = musicWs.on("SEARCH_RESULTS", (data) => { setSearchResults(data.results || []); setIsSearching(false); });
    const offError = musicWs.on("ERROR", (data) => { showNotif(`오류: ${data.message}`); setIsSearching(false); });
    loadPlaylists();
    return () => { offConnected(); offDisconnected(); offState(); offSearch(); offError(); musicWs.disconnect(); };
  }, [guildId, navigate, showNotif, loadPlaylists]);

  const handlePlayPause = () => { if (!guildId) return; if (music.isPlaying) musicWs.pause(guildId); else if (music.isPaused) musicWs.resume(guildId); };
  const handleSkip = () => guildId && musicWs.skip(guildId);
  const handleStop = () => guildId && musicWs.stop(guildId);
  const handleLoopCycle = () => { if (!guildId) return; const next = music.loopMode === "off" ? "track" : music.loopMode === "track" ? "queue" : "off"; musicWs.setLoop(guildId, next); };
  const handleAutoplay = () => { if (!guildId) return; musicWs.setAutoplay(guildId, !music.autoplay); };
  const handleVolumeChange = (e: ChangeEvent<HTMLInputElement>) => setVolumeLocal(Number(e.target.value));
  const handleVolumeCommit = () => { if (guildId) musicWs.setVolume(guildId, volumeLocal); };
  const handleSeekChange = (e: ChangeEvent<HTMLInputElement>) => { setIsDragging(true); setPositionLocal(Number(e.target.value)); };
  const handleSeekCommit = () => { setIsDragging(false); if (guildId) musicWs.seek(guildId, positionLocal); };
  const handleRemoveTrack = (index: number) => { if (guildId) musicWs.removeTrack(guildId, index); };
  const handleMoveUp = (index: number) => { if (guildId && index > 1) musicWs.moveTrack(guildId, index, index - 1); };
  const handleMoveDown = (index: number) => { if (guildId && index < music.queue.length - 1) musicWs.moveTrack(guildId, index, index + 1); };

  const handleCreatePlaylist = async () => { const name = newPlaylistName.trim(); if (!name) return; const token = localStorage.getItem("music_token"); if (!token) return; const res = await createPlaylist(token, name); if (res.success) { setNewPlaylistName(""); setIsCreatingPlaylist(false); loadPlaylists(); showNotif(`"${res.playlist.name}" 생성됨`); } };
  const handleDeletePlaylist = async (id: string, name: string) => { const token = localStorage.getItem("music_token"); if (!token) return; const res = await deletePlaylistApi(token, id); if (res.success) { if (expandedPlaylist?.id === id) setExpandedPlaylist(null); loadPlaylists(); showNotif(`"${name}" 삭제됨`); } };
  const handleExpandPlaylist = async (pl: Playlist) => { if (expandedPlaylist?.id === pl.id) { setExpandedPlaylist(null); return; } const token = localStorage.getItem("music_token"); if (!token) return; const res = await getPlaylistDetail(token, pl.id); if (res.success) setExpandedPlaylist(res.playlist); };
  const handlePlayPlaylist = (pl: Playlist) => { if (!guildId || !user || !pl.tracks?.length) return; pl.tracks.forEach((t) => { musicWs.play(guildId, t.uri, user.id, user.global_name || user.username); }); showNotif(`"${pl.name}" ${pl.tracks.length}곡 추가됨`); setSidebarTab("queue"); };
  const handleAddTrackToPlaylist = async (playlistId: string, track: PlaylistTrack) => { const token = localStorage.getItem("music_token"); if (!token) return; const res = await addTracksToPlaylistApi(token, playlistId, [track]); if (res.success) { showNotif("플레이리스트에 추가됨"); setAddToPlaylistTrack(null); loadPlaylists(); } };
  const handleRemoveTrackFromPlaylist = async (playlistId: string, index: number) => { const token = localStorage.getItem("music_token"); if (!token) return; const res = await removeTrackFromPlaylistApi(token, playlistId, index); if (res.success && expandedPlaylist) { setExpandedPlaylist({ ...expandedPlaylist, tracks: expandedPlaylist.tracks?.filter((_, i) => i !== index) }); loadPlaylists(); } };
  const handleRenamePlaylist = async (id: string) => { const name = renameValue.trim(); if (!name) return; const token = localStorage.getItem("music_token"); if (!token) return; const res = await renamePlaylist(token, id, name); if (res.success) { setRenamingId(null); loadPlaylists(); } };

  const handleSearchInput = (e: ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value; setSearchQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(() => { if (!guildId) return; setIsSearching(true); musicWs.search(guildId, q.trim()); }, 600);
  };

  const handlePlaySearch = (result: SearchResult) => {
    if (!guildId || !user) return;
    musicWs.play(guildId, result.uri, user.id, user.global_name || user.username);
    setSearchQuery(""); setSearchResults([]); showNotif(`대기열에 추가됨`);
  };

  const progress = music.currentTrack?.duration ? (positionLocal / music.currentTrack.duration) * 100 : 0;

  return (
    <div className="mp">
      {notification && <div className="mp-toast fade-in">{notification}</div>}

      {/* ── Top bar ── */}
      <header className="mp-topbar">
        <button className="mp-back" onClick={() => navigate("/servers")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div className="mp-topbar-right">
          <div className={`mp-status ${wsStatus}`}><span className="mp-status-dot" /></div>
          {guildId && guildIcon && (
            <img src={getGuildIconUrl(guildId, guildIcon)} alt="" className="mp-guild-icon"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          )}
          {user && <img src={getAvatarUrl(user.id, user.avatar)} alt="" className="mp-user-avatar" />}
        </div>
      </header>

      {/* ── Split layout ── */}
      <div className="mp-body">

        {/* ── Left: Player ── */}
        <section className="mp-player">
          {/* Artwork */}
          <div className="mp-artwork">
            {music.currentTrack ? (
              <img src={music.currentTrack.thumbnail} alt="" className="mp-artwork-img" />
            ) : (
              <div className="mp-artwork-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                  <path d="M9 18V5l12-2v13" stroke="#333" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="6" cy="18" r="3" fill="#282828" />
                  <circle cx="18" cy="16" r="3" fill="#222" />
                </svg>
              </div>
            )}
          </div>

          {/* Track info */}
          <div className="mp-track-detail">
            {music.currentTrack ? (
              <>
                <h2 className="mp-track-title truncate">{music.currentTrack.title}</h2>
                <p className="mp-track-artist truncate">{music.currentTrack.author}</p>
                {music.currentTrack.requestedBy && (
                  <p className="mp-track-requested">
                    {music.currentTrack.requestedByName || music.currentTrack.requestedBy}
                  </p>
                )}
              </>
            ) : (
              <>
                <h2 className="mp-track-title mp-track-title--empty">재생 중인 곡 없음</h2>
                <p className="mp-track-artist">곡을 검색해서 추가하세요</p>
              </>
            )}
          </div>

          {/* Progress */}
          <div className="mp-progress">
            <div className="mp-progress-bar">
              <div className="mp-progress-fill" style={{ width: `${progress}%` }} />
              <input type="range" min={0} max={music.currentTrack?.duration || 1} value={positionLocal}
                onChange={handleSeekChange} onMouseUp={handleSeekCommit} onTouchEnd={handleSeekCommit}
                disabled={!music.currentTrack || music.currentTrack.isStream} className="mp-progress-input" />
            </div>
            <div className="mp-progress-time">
              <span>{formatTime(positionLocal)}</span>
              <span>{music.currentTrack?.isStream ? "LIVE" : formatTime(music.currentTrack?.duration || 0)}</span>
            </div>
          </div>

          {/* Controls */}
          <div className="mp-controls">
            <button className={`mp-ctrl ${music.loopMode !== "off" ? "mp-ctrl--on" : ""}`} onClick={handleLoopCycle}
              title={music.loopMode === "off" ? "반복 없음" : music.loopMode === "track" ? "한 곡 반복" : "전체 반복"}>
              {music.loopMode === "track" ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 014-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 01-4 4H3" /><text x="12" y="15" textAnchor="middle" fill="currentColor" fontSize="8" fontWeight="bold" stroke="none">1</text></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 014-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 01-4 4H3" /></svg>
              )}
            </button>

            <button className="mp-ctrl" disabled title="이전" style={{ transform: "scaleX(-1)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
            </button>

            <button className="mp-play" onClick={handlePlayPause} disabled={!music.currentTrack && !music.isPaused}>
              {music.isPlaying ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              )}
            </button>

            <button className="mp-ctrl" onClick={handleSkip} disabled={music.queue.length === 0} title="다음">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
            </button>

            <button className="mp-ctrl" onClick={handleStop} disabled={!music.currentTrack && music.queue.length === 0} title="정지">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
            </button>
          </div>

          {/* Volume + extras */}
          <div className="mp-extras">
            <div className="mp-volume">
              <button className="mp-ctrl" onClick={() => { const v = volumeLocal === 0 ? 50 : 0; setVolumeLocal(v); if (guildId) musicWs.setVolume(guildId, v); }}>
                {volumeLocal === 0 ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12A4.5 4.5 0 0014 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" /></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" /></svg>
                )}
              </button>
              <input type="range" min={0} max={100} value={volumeLocal}
                onChange={handleVolumeChange} onMouseUp={handleVolumeCommit} onTouchEnd={handleVolumeCommit}
                className="mp-vol-slider"
                style={{ background: `linear-gradient(to right, var(--white) ${volumeLocal}%, #333 ${volumeLocal}%)` }} />
              <span className="mp-vol-val">{volumeLocal}%</span>
            </div>
            <div className="mp-extra-btns">
              <button className={`mp-extra-btn ${music.autoplay ? "mp-extra-btn--on" : ""}`} onClick={handleAutoplay}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z" /></svg>
                자동재생
              </button>
              {music.currentTrack && (
                <button className="mp-extra-btn" onClick={() => {
                  if (!music.currentTrack) return;
                  setAddToPlaylistTrack({ title: music.currentTrack.title, uri: music.currentTrack.uri, author: music.currentTrack.author, duration: music.currentTrack.duration, thumbnail: music.currentTrack.thumbnail });
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  저장
                </button>
              )}
            </div>
          </div>
        </section>

        {/* ── Right: Sidebar ── */}
        <aside className="mp-sidebar">
          <div className="mp-sidebar-tabs">
            <button className={`mp-tab ${sidebarTab === "queue" ? "mp-tab--active" : ""}`} onClick={() => setSidebarTab("queue")}>
              대기열{music.queue.length > 0 && <span className="mp-badge">{music.queue.length}</span>}
            </button>
            <button className={`mp-tab ${sidebarTab === "playlist" ? "mp-tab--active" : ""}`} onClick={() => { setSidebarTab("playlist"); loadPlaylists(); }}>
              플레이리스트{playlists.length > 0 && <span className="mp-badge">{playlists.length}</span>}
            </button>
          </div>

          {sidebarTab === "queue" && (
            <div className="mp-sidebar-content">
              {/* Search */}
              <div className="mp-search">
                <svg className="mp-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input type="text" placeholder="곡 검색..." value={searchQuery} onChange={handleSearchInput} className="mp-search-input" />
                {searchQuery && (
                  <button className="mp-search-clear" onClick={() => { setSearchQuery(""); setSearchResults([]); }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                )}
              </div>

              {isSearching && <div className="mp-loading"><div className="spinner" /> 검색 중...</div>}

              {searchResults.length > 0 && (
                <div className="mp-results">
                  {searchResults.map((r, i) => (
                    <button key={r.uri || i} className="mp-row" onClick={() => handlePlaySearch(r)}>
                      <img src={r.thumbnail} alt="" className="mp-row-thumb" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      <div className="mp-row-info">
                        <span className="mp-row-name truncate">{r.title}</span>
                        <span className="mp-row-sub">{r.author} · {formatTime(r.duration)}</span>
                      </div>
                      <button className="mp-icon-btn" title="플레이리스트에 저장" onClick={(e) => {
                        e.stopPropagation();
                        setAddToPlaylistTrack({ title: r.title, uri: r.uri, author: r.author, duration: r.duration, thumbnail: r.thumbnail });
                      }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                      </button>
                    </button>
                  ))}
                </div>
              )}

              {/* Queue */}
              {!searchResults.length && !isSearching && (
                <div className="mp-queue">
                  <div className="mp-queue-head">
                    <span className="mp-queue-label">대기열</span>
                    {music.queue.length > 1 && (
                      <span className="mp-queue-sub">{music.queue.length - 1}곡 · {formatTime(music.queue.slice(1).reduce((a, t) => a + t.duration, 0))}</span>
                    )}
                  </div>
                  {music.queue.length === 0 ? (
                    <div className="mp-empty">
                      <p>대기열이 비어있습니다</p>
                      <p className="mp-empty-sub">곡을 검색해서 추가하세요</p>
                    </div>
                  ) : (
                    <div className="mp-queue-list">
                      {music.queue.map((track, i) => (
                        <div key={`${track.uri}-${i}`} className={`mp-row ${i === 0 ? "mp-row--now" : ""}`}>
                          <div className="mp-row-pos">
                            {i === 0 ? <div className="mp-bars"><span /><span /><span /></div> : <span className="mp-row-num">{i}</span>}
                          </div>
                          <img src={track.thumbnail} alt="" className="mp-row-thumb" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          <div className="mp-row-info">
                            <span className="mp-row-name truncate">{track.title}</span>
                            <span className="mp-row-sub">{track.author} · {track.isStream ? "LIVE" : formatTime(track.duration)}</span>
                          </div>
                          <div className="mp-row-actions">
                            {i > 0 && (
                              <>
                                <button className="mp-icon-btn" onClick={() => handleMoveUp(i)} disabled={i <= 1}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18 15 12 9 6 15" /></svg>
                                </button>
                                <button className="mp-icon-btn" onClick={() => handleMoveDown(i)} disabled={i >= music.queue.length - 1}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
                                </button>
                              </>
                            )}
                            <button className="mp-icon-btn mp-icon-btn--danger" onClick={() => handleRemoveTrack(i)}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Playlist tab */}
          {sidebarTab === "playlist" && (
            <div className="mp-sidebar-content">
              <div className="mp-queue-head">
                <span className="mp-queue-label">내 플레이리스트</span>
                <button className="mp-icon-btn" onClick={() => setIsCreatingPlaylist(true)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                </button>
              </div>

              {isCreatingPlaylist && (
                <div className="mp-pl-create">
                  <input autoFocus className="mp-input" placeholder="이름 입력" value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleCreatePlaylist(); if (e.key === "Escape") { setIsCreatingPlaylist(false); setNewPlaylistName(""); } }} />
                  <div className="mp-pl-create-btns">
                    <button className="mp-btn mp-btn--primary" onClick={handleCreatePlaylist} disabled={!newPlaylistName.trim()}>만들기</button>
                    <button className="mp-btn" onClick={() => { setIsCreatingPlaylist(false); setNewPlaylistName(""); }}>취소</button>
                  </div>
                </div>
              )}

              {playlistLoading ? (
                <div className="mp-empty"><div className="spinner" /></div>
              ) : playlists.length === 0 ? (
                <div className="mp-empty"><p>플레이리스트가 없습니다</p></div>
              ) : (
                <div className="mp-pl-list">
                  {playlists.map((pl) => (
                    <div key={pl.id} className="mp-pl-item">
                      <div className="mp-pl-row" onClick={() => handleExpandPlaylist(pl)}>
                        <svg className="mp-pl-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z" /></svg>
                        <div className="mp-pl-info">
                          {renamingId === pl.id ? (
                            <input autoFocus className="mp-input mp-input--sm" value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)} onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") handleRenamePlaylist(pl.id); if (e.key === "Escape") setRenamingId(null); }} />
                          ) : <span className="mp-pl-name truncate">{pl.name}</span>}
                          <span className="mp-pl-count">{pl.trackCount}곡</span>
                        </div>
                        <div className="mp-pl-actions" onClick={(e) => e.stopPropagation()}>
                          <button className="mp-icon-btn" onClick={() => { if (expandedPlaylist?.id === pl.id) handlePlayPlaylist(expandedPlaylist); else handleExpandPlaylist(pl); }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                          </button>
                          <button className="mp-icon-btn" onClick={() => { setRenamingId(pl.id); setRenameValue(pl.name); }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                          </button>
                          <button className="mp-icon-btn mp-icon-btn--danger" onClick={() => handleDeletePlaylist(pl.id, pl.name)}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /></svg>
                          </button>
                        </div>
                      </div>
                      {expandedPlaylist?.id === pl.id && (
                        <div className="mp-pl-tracks">
                          {!expandedPlaylist.tracks?.length ? (
                            <p className="mp-pl-tracks-empty">곡이 없습니다</p>
                          ) : (
                            <>
                              <button className="mp-btn mp-btn--full" onClick={() => handlePlayPlaylist(expandedPlaylist)}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                                전체 추가 ({expandedPlaylist.tracks.length}곡)
                              </button>
                              {expandedPlaylist.tracks.map((track, idx) => (
                                <div key={idx} className="mp-row mp-row--sm">
                                  <img src={track.thumbnail || ""} alt="" className="mp-row-thumb mp-row-thumb--sm" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                                  <div className="mp-row-info">
                                    <span className="mp-row-name truncate">{track.title}</span>
                                    <span className="mp-row-sub">{track.author} · {formatTime(track.duration)}</span>
                                  </div>
                                  <div className="mp-row-actions">
                                    <button className="mp-icon-btn" onClick={() => { if (!guildId || !user) return; musicWs.play(guildId, track.uri, user.id, user.global_name || user.username); showNotif(`대기열에 추가됨`); }}>
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                                    </button>
                                    <button className="mp-icon-btn mp-icon-btn--danger" onClick={() => handleRemoveTrackFromPlaylist(pl.id, idx)}>
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
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
        </aside>
      </div>

      {/* Modal */}
      {addToPlaylistTrack && (
        <div className="mp-modal-overlay" onClick={() => setAddToPlaylistTrack(null)}>
          <div className="mp-modal fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="mp-modal-head">
              <span className="mp-modal-title">플레이리스트에 추가</span>
              <button className="mp-icon-btn" onClick={() => setAddToPlaylistTrack(null)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <p className="mp-modal-track truncate">{addToPlaylistTrack.title}</p>
            {playlists.length === 0 ? (
              <p className="mp-modal-empty">플레이리스트가 없습니다</p>
            ) : (
              <div className="mp-modal-list">
                {playlists.map((pl) => (
                  <button key={pl.id} className="mp-modal-item" onClick={() => handleAddTrackToPlaylist(pl.id, addToPlaylistTrack)}>
                    <span>{pl.name}</span>
                    <span className="mp-modal-item-count">{pl.trackCount}곡</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
