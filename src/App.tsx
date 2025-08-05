import { useEffect, useState } from "react";
import { useUniqueName } from "./hooks/useUniqueName";
import { useWs } from "./hooks/useWs";

function App() {
  const { name } = useUniqueName();
  const url = import.meta.env.VITE_SERVER_URL;
  const [isReady, message, sendData] = useWs({ url });
  const [devices, setDevices] = useState<string[]>([]);

  useEffect(() => {
    if (message) {
      try {
        const m = JSON.parse(message);
        console.log("Message: ", m);
        if (m.type == "bucket_update") {
          setDevices(m.devices);
        }
      } catch (error) {
        console.error("JSON parsing error: ", error);
      }
    }
  }, [message]);

  useEffect(() => {
    if (!isReady || !name) return;

    if (isReady && sendData) {
      const data = {
        type: "register",
        name: name,
      };

      console.log("Register: ", data);
      sendData(JSON.stringify(data));
    }
  }, [name, isReady, sendData]);

  return (
    <div>
      <div className="p-6">
        <h1 className="text-3xl font-bold">File Share App</h1>
        <p>Hello, {name}</p>
        <h3 className="text-xl mt-6">Devices</h3>
        {devices.filter((d) => {
          if (d !== name) return <p key={d}>{d}</p>;
        })}
      </div>
    </div>
  );
}

export default App;
