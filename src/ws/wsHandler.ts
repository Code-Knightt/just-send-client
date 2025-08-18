import { useCallback, useMemo } from "react";
import { useRTCStore } from "../stores/useRTCStore";
import type { SendData } from "../types";
import { toast } from "react-hot-toast";

interface RouterDeps {
  sendData: SendData | null;
  handleBucketUpdate: (data: unknown) => void;
  setCode: (code?: string) => void;
  promptForCode: () => Promise<string>;
  setOpenFileModal: (arg0: boolean) => void;
  closeCodeInputModal: () => void;
}

export interface Message {
  type: string;
  sender: string;
  receiver: string;
}

interface OfferMessage extends Message {
  type: "offer";
  sdp?: string;
}

interface AnswerMessage extends Message {
  type: "answer";
  sdp?: string;
  code?: string;
}

interface IceMessage extends Message {
  type: "ice_candidate";
  candidate?: RTCIceCandidateInit;
}

interface ErrorMessage extends Message {
  type: "auth_error";
  reason: string;
}

interface CodeMessage extends Message {
  type: "verification_code";
  code: string;
}

export function useWsMessageRouter({
  sendData,
  handleBucketUpdate,
  setCode,
  promptForCode,
  setOpenFileModal,
  closeCodeInputModal,
}: RouterDeps) {
  const {
    handleOffer,
    handleAnswer,
    addIceCandidate,
    closeConnection,
    setPeers,
  } = useRTCStore();

  const offerHandler = useCallback(
    async (data: unknown) => {
      if (!sendData) {
        throw new Error("Send Data not defined");
      }

      const message = data as OfferMessage;
      setPeers({ sender: message.sender, receiver: message.receiver });

      try {
        // Receiver prompts for the verification code
        const code = await promptForCode();

        const payload: RTCSessionDescriptionInit = {
          type: message.type,
          sdp: message.sdp,
        };

        const answer = await handleOffer(payload, message.sender, sendData);
        // Include the code in the answer message
        sendData(JSON.stringify({ ...message, ...answer, code }));
        setOpenFileModal(true);
      } catch (e) {
        console.error(e);
        closeConnection();
      }
    },
    [
      sendData,
      handleOffer,
      promptForCode,
      setPeers,
      setOpenFileModal,
      closeConnection,
    ]
  );

  const answerHandler = useCallback(
    async (data: unknown) => {
      if (!sendData) {
        throw new Error("Send Data not defined");
      }

      const message = data as AnswerMessage;
      setCode(undefined);
      const payload: RTCSessionDescriptionInit = {
        type: message.type,
        sdp: message.sdp,
      };

      setOpenFileModal(true);
      await handleAnswer(payload, sendData);
    },
    [sendData, handleAnswer, setOpenFileModal, setCode]
  );

  const verificationCodeHandler = useCallback(
    (data: unknown) => {
      const message = data as CodeMessage;
      setCode(message.code);
    },
    [setCode]
  );

  const iceCandidateHandler = useCallback(
    async (data: unknown) => {
      const message = data as IceMessage;
      await addIceCandidate(new RTCIceCandidate(message.candidate));
    },
    [addIceCandidate]
  );

  const authErrorHandler = useCallback(
    (data: unknown) => {
      const message = data as ErrorMessage;
      toast.error(message.reason);
      setOpenFileModal(false);
      if (sendData) {
        closeConnection();
      }
    },
    [setOpenFileModal, closeConnection, sendData]
  );

  const closeHandler = useCallback(() => {
    closeCodeInputModal();
    setCode(undefined);
    setOpenFileModal(false);
    closeConnection();
  }, [setCode, setOpenFileModal, closeCodeInputModal, closeConnection]);

  const handlers = useMemo(
    () => ({
      offer: offerHandler,
      answer: answerHandler,
      bucket_update: handleBucketUpdate,
      verification_code: verificationCodeHandler,
      ice_candidate: iceCandidateHandler,
      auth_error: authErrorHandler,
      close: closeHandler,
    }),
    [
      offerHandler,
      answerHandler,
      handleBucketUpdate,
      verificationCodeHandler,
      iceCandidateHandler,
      authErrorHandler,
      closeHandler,
    ]
  );

  const route = useCallback(
    async (raw: string) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        console.error("Error parsing JSON:", e);
        return;
      }

      if (!parsed || typeof parsed !== "object" || !("type" in parsed)) return;

      const type = (parsed as { type: string }).type;
      if (typeof type === "string" && type in handlers) {
        const key = type as keyof typeof handlers;
        await handlers[key](parsed);
      }
    },
    [handlers]
  );

  return route;
}
