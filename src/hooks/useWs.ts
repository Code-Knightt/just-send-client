import { useState, useRef, useEffect, useCallback } from "react";

export const useWs = ({
  url,
}: {
  url: string;
}): [
  boolean,
  string | null,
  (
    | ((data: string | ArrayBufferLike | Blob | ArrayBufferView) => void)
    | undefined
  )
] => {
  const [isReady, setIsReady] = useState(false);
  const [val, setVal] = useState<string | null>(null);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    const socket = new WebSocket(url);

    socket.onopen = () => setIsReady(true);
    socket.onclose = () => setIsReady(false);
    socket.onmessage = (event) => setVal(event.data);

    ws.current = socket;

    return () => {
      socket.close();
    };
  }, [url]);

  const send = useCallback(
    (data: string | ArrayBufferLike | Blob | ArrayBufferView) => {
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(data);
      }
    },
    []
  );

  return [isReady, val, ws.current ? send : undefined];
};
