// hooks/useWsBootstrap.ts
import { useEffect, useRef, useState } from "react";
import { useWsStore } from "../stores/useWsStore";

interface UseWsConnectionOptions {
  url: string;
  name: string | null;
  retryInterval?: number;
  maxRetries?: number;
}

export function useWsConnection({
  url,
  name,
  retryInterval = 2000,
  maxRetries = 3,
}: UseWsConnectionOptions) {
  const { initialize: initializeWs, sendData } = useWsStore();
  const [retryCount, setRetryCount] = useState(0);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const hasConnected = useRef(false);

  useEffect(() => {
    if (!name) return; // wait until we have a name

    if (hasConnected.current || retryCount >= maxRetries) return;

    const timeout = setTimeout(() => {
      initializeWs(url);

      if (sendData) {
        sendData(JSON.stringify({ type: "register", name }));
        hasConnected.current = true;
      } else {
        setRetryCount((c) => c + 1);
      }
    }, retryInterval);

    return () => clearTimeout(timeout);
  }, [
    retryCount,
    name,
    url,
    initializeWs,
    sendData,
    retryInterval,
    maxRetries,
  ]);

  useEffect(() => {
    if (retryCount >= maxRetries && !hasConnected.current) {
      setConnectionFailed(true);
    }
  }, [retryCount, maxRetries]);

  return { hasConnected, connectionFailed };
}
