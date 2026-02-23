export interface Track {
  title: string;
  author: string;
  duration: number;
  thumbnail: string;
  uri: string;
  identifier: string;
  source: string;
  requestedBy: string;
  requestedByName?: string;
  isStream: boolean;
}

export interface MusicState {
  isPlaying: boolean;
  isPaused: boolean;
  queue: Track[];
  currentTrack: Track | null;
  loopMode: "off" | "track" | "queue";
  autoplay: boolean;
  volume: number;
  position: number;
}

export interface Guild {
  id: string;
  name: string;
  icon: string | null;
  botInGuild: boolean;
  musicViewAccess: boolean;
  owner: boolean;
  memberCount: number;
  onlineCount: number;
}

export interface User {
  id: string;
  username: string;
  global_name: string;
  discriminator: string;
  avatar: string | null;
}

export interface SearchResult {
  title: string;
  author: string;
  duration: number;
  thumbnail: string;
  uri: string;
  identifier: string;
  source: string;
}

export interface PlaylistTrack {
  title: string;
  uri: string;
  author: string;
  duration: number;
  thumbnail: string | null;
}

export interface Playlist {
  id: string;
  name: string;
  trackCount: number;
  createdAt: string;
  updatedAt: string;
  tracks?: PlaylistTrack[];
}
