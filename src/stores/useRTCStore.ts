import { create } from "zustand";

// Define a type for the signaling callback
type SendData = (
  data: string | Blob | ArrayBufferLike | ArrayBufferView<ArrayBufferLike>
) => void;

// Optional: finished-file representation
type ReceivedFile = {
  name: string;
  size: number;
  mime: string;
  blob: Blob;
  url: string;
};

type TransferProgress = {
  total: number; // bytes total
  transferred: number; // bytes transferred so far
  percent: number; // 0..100
  startedAt: number; // ts ms
  finishedAt?: number; // ts ms
};

interface RTCStore {
  sender: string;
  receiver: string;
  connection: RTCPeerConnection | null;
  dataChannel: RTCDataChannel | null;
  setPeers: (peers: { sender?: string; receiver?: string }) => void;
  createOffer: (receiver: string) => Promise<RTCSessionDescriptionInit>;
  handleOffer: (
    offer: RTCSessionDescriptionInit,
    sender: string,
    sendData: SendData,
    onDataMessage?: (data: string | ArrayBuffer) => void
  ) => Promise<RTCSessionDescriptionInit>;
  handleAnswer: (
    answer: RTCSessionDescriptionInit,
    sendData: SendData
  ) => Promise<void>;
  addIceCandidate: (candidate: RTCIceCandidateInit) => Promise<void>;
  sendFile: (file: File) => void;
  closeConnection: () => void;

  // Receiving
  receiveFileMessage: (data: string | ArrayBuffer) => void;
  lastReceivedFile: ReceivedFile | null;
  setOnFileReceived: (cb: ((f: ReceivedFile) => void) | null) => void;
  onFileReceived: ((f: ReceivedFile) => void) | null;

  // NEW: Progress
  sendProgress: TransferProgress | null;
  recvProgress: TransferProgress | null;
  setOnSendProgress: (cb: ((p: TransferProgress) => void) | null) => void;
  setOnReceiveProgress: (cb: ((p: TransferProgress) => void) | null) => void;
  onSendProgress: ((p: TransferProgress) => void) | null;
  onReceiveProgress: ((p: TransferProgress) => void) | null;
}

// Helper to create a new RTCPeerConnection with ICE handling
function createPeerConnection(): RTCPeerConnection {
  const iceServers = import.meta.env.VITE_STUN_URLS.split(" ").map(
    (url: string) => ({ urls: url })
  );

  const servers = { iceServers };
  const conn = new RTCPeerConnection(servers);

  if (import.meta.env.DEV) {
    conn.onconnectionstatechange = () => {
      console.log("Connection Status: ", conn.connectionState);
    };
    conn.oniceconnectionstatechange = () => {
      console.log("ICE Connection State: ", conn.iceConnectionState);
    };
  }

  return conn;
}

// Internal structure for in-progress receive
type IncomingState = {
  name: string;
  size: number;
  mime: string;
  received: number;
  chunks: ArrayBuffer[];
} | null;

export const useRTCStore = create<RTCStore>((set, get) => {
  let incoming: IncomingState = null;

  return {
    sender: "",
    receiver: "",
    connection: null,
    dataChannel: null,

    lastReceivedFile: null,
    onFileReceived: null,
    setOnFileReceived: (cb) => set({ onFileReceived: cb }),

    // NEW: progress state + callbacks
    sendProgress: null,
    recvProgress: null,
    onSendProgress: null,
    onReceiveProgress: null,
    setOnSendProgress: (cb) => set({ onSendProgress: cb }),
    setOnReceiveProgress: (cb) => set({ onReceiveProgress: cb }),

    setPeers: ({ sender, receiver }) => {
      if (sender) set({ sender });
      if (receiver) set({ receiver });
    },

    createOffer: async (receiver) => {
      if (get().connection) throw new Error("Connection already established");

      const conn = createPeerConnection();
      const channel = conn.createDataChannel("fileChannel");
      channel.binaryType = "arraybuffer";
      channel.onopen = () => console.log("DataChannel open");
      channel.onclose = () => console.log("DataChannel closed");

      set({ connection: conn, dataChannel: channel, receiver });

      const offer = await conn.createOffer();
      await conn.setLocalDescription(offer);
      return offer;
    },

    handleOffer: async (offer, sender, sendData, onDataMessage) => {
      if (get().connection) throw new Error("Connection already established");

      const conn = createPeerConnection();

      conn.onicecandidate = (event) => {
        if (event.candidate) {
          sendData(
            JSON.stringify({
              type: "ice-candidate",
              candidate: event.candidate,
              to: sender,
            })
          );
        }
      };

      conn.ondatachannel = (event) => {
        const channel = event.channel;
        channel.binaryType = "arraybuffer";
        channel.onopen = () => console.log("DataChannel open");
        channel.onclose = () => console.log("DataChannel closed");

        channel.onmessage = (msg) => {
          onDataMessage?.(msg.data);
          get().receiveFileMessage(msg.data);
        };

        set({ dataChannel: channel });
      };

      await conn.setRemoteDescription(offer);
      const answer = await conn.createAnswer();
      await conn.setLocalDescription(answer);
      set({ connection: conn, sender });
      return answer;
    },

    handleAnswer: async (answer, sendData) => {
      const conn = get().connection;
      if (!conn) throw new Error("No connection found");
      await conn.setRemoteDescription(answer);

      conn.onicecandidate = (event) => {
        if (event.candidate) {
          sendData(
            JSON.stringify({
              type: "ice-candidate",
              candidate: event.candidate,
              to: get().sender,
            })
          );
        }
      };
    },

    addIceCandidate: async (candidate) => {
      const conn = get().connection;
      if (!conn) throw new Error("No connection to add ICE candidate");
      await conn.addIceCandidate(candidate);
    },

    sendFile: (file) => {
      const channel = get().dataChannel;
      if (!channel || channel.readyState !== "open") {
        console.error("Channel not open");
        return;
      }

      // Tunables
      const CHUNK_SIZE = 16 * 1024; // 16 KiB works well across routes
      const BA_LOW = 256 * 1024; // Resume threshold for backpressure (256 KiB)
      const PROGRESS_INTERVAL_MS = 200; // Throttle progress updates

      // Ensure a sensible threshold (you can tweak higher if links are fast)
      channel.bufferedAmountLowThreshold = Math.max(
        channel.bufferedAmountLowThreshold || 0,
        BA_LOW
      );

      // Init progress
      const start = Date.now();
      let offset = 0;
      let lastEmit = 0;

      const emitProgress = (final = false) => {
        const now = Date.now();
        if (!final && now - lastEmit < PROGRESS_INTERVAL_MS) return;
        lastEmit = now;

        const total = file.size || 0;
        const transferred = Math.min(offset, total);
        const percent =
          total === 0 ? 100 : Math.min(100, (transferred / total) * 100);

        const updated = {
          total,
          transferred,
          percent,
          startedAt: get().sendProgress?.startedAt ?? start,
          finishedAt: final ? now : undefined,
        };
        set({ sendProgress: updated });
        get().onSendProgress?.(updated);
      };

      // Send metadata (don’t count toward file bytes)
      try {
        channel.send(
          JSON.stringify({
            type: "metadata",
            name: file.name,
            size: file.size,
            mime: file.type,
          })
        );
      } catch (e) {
        console.error("Failed to send metadata:", e);
        return;
      }

      set({
        sendProgress: {
          total: file.size,
          transferred: 0,
          percent: file.size === 0 ? 100 : 0,
          startedAt: start,
        },
      });
      get().onSendProgress?.(get().sendProgress!);

      const reader = new FileReader();

      const maybeContinue = () => {
        if (offset >= file.size) {
          try {
            channel.send(JSON.stringify({ type: "done" }));
          } catch (e) {
            console.error("Failed to send done marker:", e);
          }
          emitProgress(true);
          return;
        }

        // Respect backpressure before reading the next slice
        if (channel.bufferedAmount > channel.bufferedAmountLowThreshold) {
          channel.onbufferedamountlow = () => {
            channel.onbufferedamountlow = null;
            readSlice(offset);
          };
          return;
        }

        readSlice(offset);
      };

      const readSlice = (o: number) => {
        const end = Math.min(o + CHUNK_SIZE, file.size);
        reader.readAsArrayBuffer(file.slice(o, end));
      };

      reader.onerror = (err) => console.error("FileReader error:", err);

      reader.onload = () => {
        const buffer = reader.result as ArrayBuffer;
        const u8 = new Uint8Array(buffer);

        // Send this chunk; if the channel is congested, we still send the chunk,
        // but we will *wait* before reading the next one in maybeContinue()
        try {
          channel.send(u8);
        } catch (e) {
          console.error("DataChannel send error:", e);
          return;
        }

        // Advance by actual bytes sent
        offset += u8.byteLength;

        // Throttled progress tick
        emitProgress(false);

        // Continue (respecting backpressure before reading next slice)
        maybeContinue();
      };

      // Kick off
      readSlice(0);
    },

    receiveFileMessage: (data: string | ArrayBuffer) => {
      try {
        // JSON messages (metadata/done)
        if (typeof data === "string") {
          const msg = JSON.parse(data);

          if (msg?.type === "metadata") {
            const size = Number(msg.size ?? 0);
            incoming = {
              name: String(msg.name ?? "received.bin"),
              size,
              mime: String(msg.mime ?? "application/octet-stream"),
              received: 0,
              chunks: [],
            };
            // init recv progress
            const start = Date.now();
            const initProg: TransferProgress = {
              total: size,
              transferred: 0,
              percent: size === 0 ? 100 : 0,
              startedAt: start,
            };
            set({ recvProgress: initProg });
            get().onReceiveProgress?.(initProg);
            if (import.meta.env.DEV) {
              console.log(
                `Receiving file "${incoming.name}" (${incoming.size} bytes, ${incoming.mime})`
              );
            }
            return;
          }

          if (msg?.type === "done") {
            if (!incoming) {
              console.warn("Received 'done' without metadata");
              return;
            }

            const blob = new Blob(incoming.chunks, { type: incoming.mime });
            const url = URL.createObjectURL(blob);

            const file: ReceivedFile = {
              name: incoming.name,
              size: incoming.size,
              mime: incoming.mime,
              blob,
              url,
            };

            // finalize recv progress
            const total = incoming.size || blob.size;
            const transferred = blob.size;
            const finalProg: TransferProgress = {
              total,
              transferred,
              percent:
                total === 0 ? 100 : Math.min(100, (transferred / total) * 100),
              startedAt: get().recvProgress?.startedAt ?? Date.now(),
              finishedAt: Date.now(),
            };
            set({ recvProgress: finalProg });
            get().onReceiveProgress?.(finalProg);

            set({ lastReceivedFile: file });
            get().onFileReceived?.(file);

            if (import.meta.env.DEV) {
              const ok =
                incoming.size === 0 ||
                blob.size === incoming.size ||
                Math.abs(blob.size - incoming.size) < 16 * 1024;
              console.log(
                `File receive complete (${blob.size} bytes)${
                  ok ? "" : " [size mismatch vs metadata]"
                }`
              );
            }
            incoming = null;
            return;
          }

          // Unknown JSON → ignore
          return;
        }

        // Binary chunk
        // const toArrayBuffer = (x: ArrayBuffer | Uint8Array): ArrayBuffer =>
        //   x instanceof ArrayBuffer ? x : x.buffer;

        let ab: ArrayBuffer | null = null;
        if (data instanceof ArrayBuffer) ab = data;
        // @ts-expect-error (handle Uint8Array)
        else if (data?.buffer instanceof ArrayBuffer) ab = data.buffer;

        if (ab) {
          if (!incoming) {
            console.warn("Binary chunk received before metadata; ignoring.");
            return;
          }
          incoming.chunks.push(ab);
          incoming.received += ab.byteLength;

          // update recv progress
          const total = incoming.size || 0;
          const transferred = incoming.received;
          const percent =
            total === 0 ? 100 : Math.min(100, (transferred / total) * 100);

          const prog: TransferProgress = {
            total,
            transferred,
            percent,
            startedAt: get().recvProgress?.startedAt ?? Date.now(),
            finishedAt: undefined,
          };
          set({ recvProgress: prog });
          get().onReceiveProgress?.(prog);

          return;
        }
      } catch (err) {
        console.error("receiveFileMessage error:", err);
      }
    },

    closeConnection: () => {
      const conn = get().connection;
      const channel = get().dataChannel;
      conn?.close();
      channel?.close();

      const last = get().lastReceivedFile;
      if (last?.url) URL.revokeObjectURL(last.url);

      set({
        connection: null,
        dataChannel: null,
        sender: "",
        receiver: "",
        lastReceivedFile: null,
        sendProgress: null,
        recvProgress: null,
      });
    },
  };
});
