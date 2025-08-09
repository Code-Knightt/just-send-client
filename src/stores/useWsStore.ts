// stores/wsStore.ts
import { create } from "zustand";

let socket: WebSocket | null = null;

interface WsStore {
  isReady: boolean;
  message: string | null;
  sendData:
    | ((data: string | ArrayBufferLike | Blob | ArrayBufferView) => void)
    | null;
  initialized: boolean;
  initialize: (url: string) => void;
  disconnect: () => void;
}

export const useWsStore = create<WsStore>((set, get) => ({
  isReady: false,
  message: null,
  sendData: null,
  initialized: false,

  initialize: (url: string) => {
    if (get().initialized) return;

    socket = new WebSocket(url);

    socket.onopen = () => {
      set({
        isReady: true,
        sendData: (data) => {
          if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(data);
          }
        },
      });
    };

    socket.onclose = () => set({ isReady: false });
    socket.onmessage = (event) => set({ message: event.data });
    socket.onerror = () => set({ isReady: false });

    set({ initialized: true });
  },

  disconnect: () => {
    if (socket) {
      socket.close();
      socket = null;
    }

    set({
      isReady: false,
      sendData: null,
      message: null,
      initialized: false,
    });
  },
}));
