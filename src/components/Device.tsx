import { useWsStore } from "../stores/useWsStore";
import { useRTCStore } from "../stores/useRTCStore";
import { useIdentityStore } from "../stores/useIdentityStore";

interface DeviceProps {
  deviceName: string;
}

function Device({ deviceName }: DeviceProps) {
  const name = useIdentityStore((s) => s.name);
  const { isReady, sendData } = useWsStore();
  const { setPeers, createOffer } = useRTCStore();

  const establishConnection = async () => {
    setPeers({
      sender: name,
      receiver: deviceName,
    });

    const offer = await createOffer(deviceName);
    if (sendData && isReady)
      sendData(
        JSON.stringify({
          type: "offer",
          sdp: offer.sdp,
          sender: name,
          receiver: deviceName,
        })
      );
  };

  return (
    <div
      className="p-4 my-2 rounded-xl bg-gray-400 text-black cursor-pointer"
      onClick={(e) => {
        e.preventDefault();
        establishConnection();
      }}
    >
      <p>{deviceName}</p>
    </div>
  );
}

export default Device;
