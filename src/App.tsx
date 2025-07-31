import { useEffect } from "react";
import { useUniqueName } from "./hooks/useUniqueName";
import { useWs } from "./hooks/useWs";

function App() {
  const name = useUniqueName(5 * 60 * 1000);
  const url = import.meta.env.VITE_SERVER_URL;
  const [isReady, message, sendData] = useWs({ url });

  useEffect(() => {
    if (message) console.log(message);
  }, [message]);

  useEffect(() => {
    if (!isReady || !name) return;

    if (isReady && sendData) {
      const data = {
        type: "register",
        name: name,
      };

      sendData(JSON.stringify(data));
    }
  }, [isReady, name, sendData]);

  return (
    <div>
      <div className="p-6">
        <h1 className="text-3xl font-bold">File Share App</h1>
        <p>Hello, {name}</p>
      </div>
    </div>
  );
}

export default App;
