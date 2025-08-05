import { useEffect, useState } from "react";
import { ClientJS } from "clientjs";
import {
  uniqueNamesGenerator,
  adjectives,
  colors,
  animals,
} from "unique-names-generator";

// Simple hash function to create a numeric seed from the fingerprint
function hashString(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

export function useUniqueName(): { name: string; fingerprint: string } {
  const [name, setName] = useState<string>("");
  const [fingerprint, setFingerprint] = useState<string>("");

  useEffect(() => {
    const client = new ClientJS();
    const fp = String(client.getFingerprint()); // Device/browser fingerprint
    setFingerprint(fp);

    const seed = hashString(fp);
    const generatedName = uniqueNamesGenerator({
      dictionaries: [adjectives, colors, animals],
      separator: "-",
      style: "lowerCase",
      seed, // Deterministic output
    });

    setName(generatedName);
  }, []);

  return { name, fingerprint };
}
