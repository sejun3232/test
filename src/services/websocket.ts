import type { MusicState, SearchResult } from "../types";

const WS_URL = import.meta.env.VITE_BOT_WS_URL as string;
const WS_API_KEY = import.meta.env.VITE_WS_API_KEY as string;

type EventMap = {
  connected: Record<string, never>;
  disconnected: Record<string, never>;
  SUBSCRIBED: { guildId: string };
  STATE_UPDATE: MusicState & { guildId: string };
  SEARCH_RESULTS: { guildId: string; query: string; results: SearchResult[] };
  TRACK_ADDED: { guildId: string; track: unknown; position: number };
  SKIPPED: { guildId: string };
  STOPPED: { guildId: string };
  PAUSED: { guildId: string };
  RESUMED: { guildId: string };
  VOLUME_CHANGED: { guildId: string; volume: number };
  LOOP_CHANGED: { guildId: string; mode: string };
  AUTOPLAY_CHANGED: { guildId: string; enabled: boolean };
  SEEKED: { guildId: string; position: number };
  TRACK_REMOVED: { guildId: string; index: number };
  TRACK_MOVED: { guildId: string; from: number; to: number };
  ERROR: { message: string };
  PONG: { timestamp: number };
};

type Listener<K extends keyof EventMap> = (data: EventMap[K]) => void;

class MusicWebSocketService {
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<Listener<keyof EventMap>>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = false;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private currentGuildId: string | null = null;

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isConnected) {
        resolve();
        return;
      }

      this.shouldReconnect = true;
      const url = `${WS_URL}?apiKey=${encodeURIComponent(WS_API_KEY)}`;

      try {
        this.ws = new WebSocket(url);
      } catch (e) {
        reject(e);
        return;
      }

      const onOpen = () => {
        this.emit("connected", {} as Record<string, never>);
        this.startPing();
        resolve();
      };

      const onError = (e: Event) => {
        reject(e);
      };

      this.ws.onopen = onOpen;
      this.ws.onerror = onError;

      this.ws.onmessage = (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data as string);
          const event = data.event as keyof EventMap;
          if (event) this.emit(event, data);
        } catch {
          // ignore parse errors
        }
      };

      this.ws.onclose = () => {
        this.stopPing();
        this.emit("disconnected", {} as Record<string, never>);
        this.currentGuildId = null;
        if (this.shouldReconnect) {
          this.reconnectTimer = setTimeout(() => {
            this.connect().then(() => {
              if (this.currentGuildId) {
                this.subscribe(this.currentGuildId);
              }
            });
          }, 3000);
        }
      };
    });
  }

  private startPing() {
    this.pingTimer = setInterval(() => {
      this.send({ action: "PING" });
    }, 30000);
  }

  private stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  send(data: object) {
    if (this.isConnected) {
      this.ws!.send(JSON.stringify(data));
    }
  }

  on<K extends keyof EventMap>(event: K, cb: Listener<K>): () => void {
    if (!this.listeners.has(event as string)) {
      this.listeners.set(event as string, new Set());
    }
    this.listeners.get(event as string)!.add(cb as Listener<keyof EventMap>);
    return () => {
      this.listeners.get(event as string)?.delete(cb as Listener<keyof EventMap>);
    };
  }

  private emit<K extends keyof EventMap>(event: K, data: EventMap[K]) {
    this.listeners.get(event as string)?.forEach((cb) => {
      (cb as Listener<K>)(data);
    });
  }

  disconnect() {
    this.shouldReconnect = false;
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.currentGuildId = null;
  }

  // Subscription
  subscribe(guildId: string) {
    this.currentGuildId = guildId;
    this.send({ action: "SUBSCRIBE", guildId });
  }

  unsubscribe(guildId: string) {
    this.send({ action: "UNSUBSCRIBE", guildId });
    this.currentGuildId = null;
  }

  // Playback controls
  play(
    guildId: string,
    uri: string,
    userId: string,
    userName: string,
    voiceChannelId?: string
  ) {
    this.send({ action: "PLAY", guildId, uri, userId, userName, voiceChannelId });
  }

  search(guildId: string, query: string) {
    this.send({ action: "SEARCH", guildId, query });
  }

  skip(guildId: string) {
    this.send({ action: "SKIP", guildId });
  }

  stop(guildId: string) {
    this.send({ action: "STOP", guildId });
  }

  pause(guildId: string) {
    this.send({ action: "PAUSE", guildId });
  }

  resume(guildId: string) {
    this.send({ action: "RESUME", guildId });
  }

  setVolume(guildId: string, volume: number) {
    this.send({ action: "SET_VOLUME", guildId, volume });
  }

  setLoop(guildId: string, mode: "off" | "track" | "queue") {
    this.send({ action: "SET_LOOP", guildId, mode });
  }

  setAutoplay(guildId: string, enabled: boolean) {
    this.send({ action: "SET_AUTOPLAY", guildId, enabled });
  }

  seek(guildId: string, position: number) {
    this.send({ action: "SEEK", guildId, position });
  }

  removeTrack(guildId: string, index: number) {
    this.send({ action: "REMOVE_TRACK", guildId, index });
  }

  moveTrack(guildId: string, from: number, to: number) {
    this.send({ action: "MOVE_TRACK", guildId, from, to });
  }

  getState(guildId: string) {
    this.send({ action: "GET_STATE", guildId });
  }
}

export const musicWs = new MusicWebSocketService();
