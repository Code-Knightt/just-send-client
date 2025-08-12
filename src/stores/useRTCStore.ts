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
  // SENDING
  sendFile: (file: File) => void; // backwards compatible
  sendFiles: (files: File[]) => Promise<void>; // NEW: batch sender
  // RECEIVING (message pump from onmessage)
  receiveFileMessage: (data: string | ArrayBuffer) => void;
  lastReceivedFile: ReceivedFile | null;
  receivedFiles: ReceivedFile[]; // NEW: keep history
  setOnFileReceived: (cb: ((f: ReceivedFile) => void) | null) => void;
  onFileReceived: ((f: ReceivedFile) => void) | null;

  // Progress
  sendProgress: TransferProgress | null; // current file (send)
  recvProgress: TransferProgress | null; // current file (recv)
  batchSendProgress: TransferProgress | null; // NEW: whole batch
  setOnSendProgress: (cb: ((p: TransferProgress) => void) | null) => void;
  setOnReceiveProgress: (cb: ((p: TransferProgress) => void) | null) => void;
  onSendProgress: ((p: TransferProgress) => void) | null;
  onReceiveProgress: ((p: TransferProgress) => void) | null;

  // Internal sending state
  isSending: boolean; // NEW: guard
  closeConnection: (sendData: SendData, reverseSender?: boolean) => void;
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

// Internal structure for in-progress receive (single at a time, sequential)
type IncomingState = {
  name: string;
  size: number;
  mime: string;
  received: number;
  chunks: ArrayBuffer[];
} | null;

let nextXferId = 1;
const genXferId = () => `${Date.now()}-${nextXferId++}`;

export const useRTCStore = create<RTCStore>((set, get) => {
  let incoming: IncomingState = null;

  return {
    sender: "",
    receiver: "",
    connection: null,
    dataChannel: null,

    lastReceivedFile: null,
    receivedFiles: [],
    onFileReceived: null,
    setOnFileReceived: (cb) => set({ onFileReceived: cb }),

    // progress state + callbacks
    sendProgress: null,
    recvProgress: null,
    batchSendProgress: null,
    onSendProgress: null,
    onReceiveProgress: null,
    setOnSendProgress: (cb) => set({ onSendProgress: cb }),
    setOnReceiveProgress: (cb) => set({ onReceiveProgress: cb }),

    isSending: false,

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
              type: "ice_candidate",
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
              type: "ice_candidate",
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

    // Backwards compatible single-file API
    sendFile: (file: File) => {
      void get().sendFiles([file]);
    },

    // NEW: Send multiple files sequentially over one channel
    sendFiles: async (files: File[]) => {
      const channel = get().dataChannel;
      if (!channel || channel.readyState !== "open") {
        console.error("Channel not open");
        return;
      }
      if (!files || files.length === 0) return;
      if (get().isSending) {
        console.warn("Already sending; ignoring new request.");
        return;
      }

      set({ isSending: true });

      // Tunables (shared)
      const CHUNK_SIZE = 16 * 1024; // 16 KiB
      const BA_LOW = 256 * 1024; // backpressure threshold
      const PROGRESS_INTERVAL_MS = 200; // throttle UI

      channel.bufferedAmountLowThreshold = Math.max(
        channel.bufferedAmountLowThreshold || 0,
        BA_LOW
      );

      // Batch progress
      const batchStart = Date.now();
      const batchTotal = files.reduce((sum, f) => sum + (f.size || 0), 0);
      let batchTransferred = 0;

      const emitBatch = (final = false) => {
        const total = batchTotal;
        const transferred = batchTransferred;
        const percent =
          total === 0 ? 100 : Math.min(100, (transferred / total) * 100);
        const updated: TransferProgress = {
          total,
          transferred,
          percent,
          startedAt: get().batchSendProgress?.startedAt ?? batchStart,
          finishedAt: final ? Date.now() : undefined,
        };
        set({ batchSendProgress: updated });
      };

      const sendOne = (file: File, index: number, count: number) =>
        new Promise<void>((resolve, reject) => {
          if (!channel || channel.readyState !== "open") {
            return reject(new Error("Channel not open"));
          }

          const xferId = genXferId();
          let offset = 0;
          let lastEmit = 0;
          const start = Date.now();
          let closed = false;

          const emitFile = (final = false) => {
            const now = Date.now();
            if (!final && now - lastEmit < PROGRESS_INTERVAL_MS) return;
            lastEmit = now;
            const total = file.size || 0;
            const transferred = Math.min(offset, total);
            const percent =
              total === 0 ? 100 : Math.min(100, (transferred / total) * 100);
            const updated: TransferProgress = {
              total,
              transferred,
              percent,
              startedAt: get().sendProgress?.startedAt ?? start,
              finishedAt: final ? now : undefined,
            };
            set({ sendProgress: updated });
            get().onSendProgress?.(updated);
          };

          const onChannelClose = () => {
            closed = true;
            reject(new Error("DataChannel closed during transfer"));
          };

          const cleanup = () => {
            if (!channel) return;
            channel.removeEventListener("close", onChannelClose);
            // don't touch onbufferedamountlow here — we set/clear per read cycle
          };

          channel.addEventListener("close", onChannelClose);

          // Send metadata for this file (include index/count for UX; receiver can ignore)
          try {
            channel.send(
              JSON.stringify({
                type: "metadata",
                id: xferId,
                name: file.name,
                size: file.size,
                mime: file.type,
                index,
                count,
              })
            );
          } catch (e) {
            cleanup();
            return reject(e instanceof Error ? e : new Error("metadata send"));
          }

          // init per-file progress
          set({
            sendProgress: {
              total: file.size,
              transferred: 0,
              percent: file.size === 0 ? 100 : 0,
              startedAt: start,
            },
          });
          get().onSendProgress?.(get().sendProgress!);
          emitBatch(false);

          const reader = new FileReader();

          const readSlice = (o: number) => {
            if (closed) return;
            const end = Math.min(o + CHUNK_SIZE, file.size);
            reader.readAsArrayBuffer(file.slice(o, end));
          };

          const maybeContinue = () => {
            if (closed) return;

            if (offset >= file.size) {
              try {
                channel.send(JSON.stringify({ type: "done", id: xferId }));
              } catch (e) {
                cleanup();
                return reject(
                  e instanceof Error ? e : new Error("done marker send")
                );
              }
              emitFile(true);
              cleanup();
              resolve();
              return;
            }

            if (channel.bufferedAmount > channel.bufferedAmountLowThreshold) {
              channel.onbufferedamountlow = () => {
                channel.onbufferedamountlow = null;
                readSlice(offset);
              };
              return;
            }

            readSlice(offset);
          };

          reader.onerror = (err) => {
            cleanup();
            reject(err instanceof Error ? err : new Error("FileReader error"));
          };

          reader.onload = () => {
            if (closed) return;
            const buffer = reader.result as ArrayBuffer;
            const u8 = new Uint8Array(buffer);

            try {
              channel.send(u8);
            } catch (e) {
              cleanup();
              reject(e instanceof Error ? e : new Error("DataChannel send"));
              return;
            }

            offset += u8.byteLength;
            batchTransferred += u8.byteLength;

            emitFile(false);
            emitBatch(false);
            maybeContinue();
          };

          // start file
          if (file.size === 0) {
            // Edge case: empty file — still send a done marker
            try {
              channel.send(JSON.stringify({ type: "done", id: xferId }));
            } catch (e) {
              cleanup();
              return reject(
                e instanceof Error ? e : new Error("done marker send")
              );
            }
            emitFile(true);
            cleanup();
            resolve();
            return;
          }

          readSlice(0);
        });

      try {
        for (let i = 0; i < files.length; i++) {
          await sendOne(files[i], i, files.length);
        }
        emitBatch(true);
      } catch (e) {
        console.error("Batch send error:", e);
      } finally {
        set({ isSending: false });
      }
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

            set((s) => ({
              lastReceivedFile: file,
              receivedFiles: [...s.receivedFiles, file],
            }));
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
        let ab: ArrayBuffer | null = null;
        if (data instanceof ArrayBuffer) ab = data;
        // @ts-expect-error handle Uint8Array
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

    closeConnection: (sendData, reverseSender = false) => {
      const conn = get().connection;
      const channel = get().dataChannel;
      conn?.close();
      channel?.close();

      const last = get().lastReceivedFile;
      if (last?.url) URL.revokeObjectURL(last.url);

      sendData(
        JSON.stringify({
          type: "close",
          sender: reverseSender ? get().receiver : get().sender,
          receiver: reverseSender ? get().sender : get().receiver,
        })
      );

      set({
        connection: null,
        dataChannel: null,
        sender: "",
        receiver: "",
        lastReceivedFile: null,
        receivedFiles: [],
        sendProgress: null,
        recvProgress: null,
        batchSendProgress: null,
        isSending: false,
      });
    },
  };
});
