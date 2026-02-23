const API_URL = import.meta.env.VITE_API_URL as string;
const API_KEY = import.meta.env.VITE_API_KEY as string;

function headers(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "x-frontend-key": API_KEY,
  };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

// API가 설정한 redirect_uri 그대로 사용 (절대 덮어쓰지 않음)
// 흐름: Discord → API callback → API가 FRONTEND_URL?token=JWT 로 리다이렉트 → 프론트에서 토큰 읽기
export async function getAuthUrl(): Promise<string> {
  const res = await fetch(`${API_URL}/api/music/auth-url`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  if (!data.url) throw new Error("auth url missing");
  return data.url as string;
}

// 코드를 직접 교환 (API redirect_uri와 동일한 redirect_uri 필요)
export async function exchangeCode(
  code: string
): Promise<{ success: boolean; token: string }> {
  const res = await fetch(`${API_URL}/api/music/auth-exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  return res.json();
}

export async function getUser(
  token: string
): Promise<{ success: boolean; user: unknown }> {
  const res = await fetch(`${API_URL}/auth/me`, {
    headers: headers(token),
  });
  return res.json();
}

export async function getGuilds(
  token: string
): Promise<{ loggedIn: boolean; user: unknown; guilds: unknown[] }> {
  const res = await fetch(`${API_URL}/api/user`, {
    headers: headers(token),
  });
  return res.json();
}

export function decodeToken(token: string): {
  id: string;
  username: string;
  global_name?: string;
  discriminator: string;
  avatar?: string;
} | null {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

export function getAvatarUrl(
  userId: string,
  avatarHash: string | null | undefined
): string {
  if (!avatarHash) {
    const index = Number(BigInt(userId) >> 22n) % 6;
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  }
  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png?size=128`;
}

export function getGuildIconUrl(
  guildId: string,
  iconHash: string | null
): string {
  if (!iconHash)
    return `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(guildId) >> 22n) % 6}.png`;
  return `https://cdn.discordapp.com/icons/${guildId}/${iconHash}.png?size=256`;
}

// ─── Playlist API ────────────────────────────────────────────────────────────

import type { Playlist, PlaylistTrack } from "../types";

function authHeaders(token: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-frontend-key": API_KEY,
    Authorization: `Bearer ${token}`,
  };
}

export async function getPlaylists(
  token: string
): Promise<{ success: boolean; playlists: Playlist[] }> {
  const res = await fetch(`${API_URL}/api/playlists`, { headers: authHeaders(token) });
  return res.json();
}

export async function getPlaylistDetail(
  token: string,
  id: string
): Promise<{ success: boolean; playlist: Playlist }> {
  const res = await fetch(`${API_URL}/api/playlists/${id}`, { headers: authHeaders(token) });
  return res.json();
}

export async function createPlaylist(
  token: string,
  name: string
): Promise<{ success: boolean; playlist: Playlist }> {
  const res = await fetch(`${API_URL}/api/playlists`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ name }),
  });
  return res.json();
}

export async function renamePlaylist(
  token: string,
  id: string,
  name: string
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_URL}/api/playlists/${id}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({ name }),
  });
  return res.json();
}

export async function deletePlaylistApi(
  token: string,
  id: string
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_URL}/api/playlists/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  return res.json();
}

export async function addTracksToPlaylistApi(
  token: string,
  id: string,
  tracks: PlaylistTrack[]
): Promise<{ success: boolean; trackCount?: number }> {
  const res = await fetch(`${API_URL}/api/playlists/${id}/tracks`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ tracks }),
  });
  return res.json();
}

export async function removeTrackFromPlaylistApi(
  token: string,
  id: string,
  index: number
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_URL}/api/playlists/${id}/tracks/${index}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  return res.json();
}
