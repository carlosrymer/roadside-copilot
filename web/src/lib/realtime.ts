import { apiUrl } from '../config';
import type { ConnectionStatus } from '../types';

export interface RealtimeCallbacks {
  onStatus: (status: ConnectionStatus, error?: string) => void;
  onServerEvent: (event: any) => void;
  onSessionInfo?: (info: { claimId: string }) => void;
}

/**
 * Drives a WebRTC voice session with OpenAI Realtime. The AWS API mints a
 * short-lived ephemeral token; audio then streams browser↔OpenAI directly.
 * Non-audio events (transcripts, function calls) flow over a data channel.
 */
export class RealtimeClient {
  private pc?: RTCPeerConnection;
  private dc?: RTCDataChannel;
  private micStream?: MediaStream;
  private audioEl?: HTMLAudioElement;

  constructor(private readonly cb: RealtimeCallbacks) {}

  async start(): Promise<void> {
    this.cb.onStatus('connecting');

    // 1. Mint an ephemeral token from our AWS API (real key stays server-side).
    const tokenRes = await fetch(apiUrl('/session'), { method: 'POST' });
    if (!tokenRes.ok) {
      throw new Error(`Could not start session (${tokenRes.status})`);
    }
    const { clientSecret, claimId } = (await tokenRes.json()) as {
      clientSecret: string;
      claimId: string;
    };
    this.cb.onSessionInfo?.({ claimId });

    // 2. Peer connection + remote audio playback.
    const pc = new RTCPeerConnection();
    this.pc = pc;

    const audioEl = new Audio();
    audioEl.autoplay = true;
    this.audioEl = audioEl;
    pc.ontrack = (e) => {
      audioEl.srcObject = e.streams[0];
    };

    // 3. Microphone capture.
    this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of this.micStream.getTracks()) {
      pc.addTrack(track, this.micStream);
    }

    // 4. Data channel for events (transcripts, tool calls).
    const dc = pc.createDataChannel('oai-events');
    this.dc = dc;
    dc.addEventListener('open', () => this.cb.onStatus('live'));
    dc.addEventListener('message', (e) => {
      try {
        this.cb.onServerEvent(JSON.parse(e.data));
      } catch {
        /* ignore non-JSON frames */
      }
    });

    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'failed') this.cb.onStatus('error', 'Connection failed');
      else if (pc.connectionState === 'disconnected') this.cb.onStatus('ended');
    });

    // 5. SDP offer → OpenAI; the token encodes the model + routing.
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const sdpRes = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${clientSecret}`,
        'Content-Type': 'application/sdp',
      },
    });
    if (!sdpRes.ok) {
      throw new Error(`Realtime handshake failed (${sdpRes.status})`);
    }
    await pc.setRemoteDescription({ type: 'answer', sdp: await sdpRes.text() });
  }

  /** Send a client event over the data channel (e.g. a tool result). */
  sendEvent(event: unknown): void {
    if (this.dc?.readyState === 'open') {
      this.dc.send(JSON.stringify(event));
    }
  }

  stop(): void {
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.dc?.close();
    this.pc?.close();
    if (this.audioEl) this.audioEl.srcObject = null;
    this.cb.onStatus('ended');
  }
}
