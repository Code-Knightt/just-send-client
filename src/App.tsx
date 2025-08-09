import { useEffect, useRef, useState } from "react";
import Device from "./components/Device";

import { useWsStore } from "./stores/useWsStore";
import { useIdentityStore } from "./stores/useIdentityStore";
import { useRTCStore } from "./stores/useRTCStore";
import DialogModal from "./components/DialogModal";

// Define a type for the signaling callback
type SendData = (
  data: string | Blob | ArrayBufferLike | ArrayBufferView<ArrayBufferLike>
) => void;

function App() {
  const { name, initialize: initializeName } = useIdentityStore();
  const { message, sendData, initialize: initializeWs } = useWsStore();
  const [devices, setDevices] = useState<string[]>([]);
  const { recvProgress } = useRTCStore();

  const [retryCount, setRetryCount] = useState(0);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const retryInterval = 2000;
  const maxRetries = 3;
  const hasConnected = useRef(false);

  const {
    handleOffer,
    handleAnswer,
    closeConnection,
    addIceCandidate,
    receiver,
    sender,
  } = useRTCStore();

  const [openModal, setOpenModal] = useState(false);

  // Initialize name once
  useEffect(() => {
    initializeName();
  }, [initializeName]);

  // Initialize WebSocket Connection and register with server
  useEffect(() => {
    if (hasConnected.current || retryCount >= maxRetries) return;

    const timeout = setTimeout(() => {
      initializeWs(import.meta.env.VITE_SERVER_URL);

      if (sendData && name) {
        sendData(JSON.stringify({ type: "register", name }));
        hasConnected.current = true;
      } else {
        setRetryCount((prev) => prev + 1);
      }
    }, retryInterval);

    return () => clearTimeout(timeout);
  }, [retryCount, initializeWs, sendData, name]);

  useEffect(() => {
    if (retryCount >= maxRetries && !hasConnected.current) {
      setConnectionFailed(true);
    }
  }, [retryCount]);

  useEffect(() => {
    if (!message) {
      return;
    }

    const processMessage = async () => {
      try {
        const m = JSON.parse(message);
        if (m.type === "bucket_update") {
          setDevices(m.devices);
        }

        if (m.type === "offer" || m.type === "answer") {
          const payload: RTCSessionDescriptionInit = {
            type: m.type,
            sdp: m.sdp,
          };

          if (m.type === "offer") {
            const answer = await handleOffer(
              payload,
              m.sender,
              sendData as SendData
            );
            if (sendData) sendData(JSON.stringify({ ...m, ...answer }));
          } else {
            await handleAnswer(payload, sendData as SendData);
            setOpenModal(true);
          }
        }

        if (m.type === "ice-candidate") {
          const candInit = m.candidate as RTCIceCandidateInit;
          await addIceCandidate(new RTCIceCandidate(candInit));
        }

        if (m.type === "close") {
          closeConnection();
        }
      } catch (error) {
        console.error("JSON parsing error: ", error);
      }
    };

    processMessage();
  }, [
    message,
    handleOffer,
    handleAnswer,
    sendData,
    closeConnection,
    addIceCandidate,
  ]);

  return (
    <div>
      <div className="p-6">
        <h1 className="text-3xl font-bold">File Share App</h1>

        {!hasConnected.current && !connectionFailed && (
          <p className="mt-4 text-gray-500 animate-pulse">Connecting...</p>
        )}

        {connectionFailed && (
          <div className="mt-4 text-red-600">
            Could not connect to the WebSocket server after multiple attempts.
            Please refresh or check your connection.
          </div>
        )}

        <DialogModal
          open={openModal}
          onClose={() => {
            setOpenModal(false);
            if (sendData)
              sendData(JSON.stringify({ type: "close", sender, receiver }));
            closeConnection();
          }}
        />

        {hasConnected.current && !connectionFailed && (
          <>
            <p>Hello, {name}</p>
            {recvProgress && (
              <div>
                {recvProgress.transferred} / {recvProgress.total} bytes (
                {recvProgress.percent.toFixed(1)}%)
              </div>
            )}
            <h3 className="text-xl mt-6">Devices</h3>
            {devices
              .filter((d) => d !== name)
              .map((el) => (
                <Device key={el} deviceName={el} />
              ))}
          </>
        )}
      </div>
    </div>
  );
}

export default App;
