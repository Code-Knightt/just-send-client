import { useEffect, useState } from "react";
import {
  uniqueNamesGenerator,
  adjectives,
  colors,
  animals,
} from "unique-names-generator";

type StoredName = {
  value: string;
  expiry: number;
};

const STORAGE_KEY = "uniqueNameData";

function generateName() {
  return uniqueNamesGenerator({
    dictionaries: [adjectives, colors, animals],
    separator: "-",
    style: "lowerCase",
  });
}

export function useUniqueName(ttl: number = 5 * 60 * 1000): string {
  const [name, setName] = useState<string>("");

  useEffect(() => {
    const now = Date.now();
    const saved = localStorage.getItem(STORAGE_KEY);

    if (saved) {
      try {
        const parsed: StoredName = JSON.parse(saved);
        if (now < parsed.expiry) {
          setName(parsed.value);
          return;
        }
      } catch {
        // ignore parse error
      }
    }

    const newName = generateName();
    const data: StoredName = {
      value: newName,
      expiry: now + ttl,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setName(newName);
  }, [ttl]);

  // Sync across tabs
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const parsed: StoredName = JSON.parse(e.newValue);
          if (Date.now() < parsed.expiry) {
            setName(parsed.value);
          }
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  return name;
}
