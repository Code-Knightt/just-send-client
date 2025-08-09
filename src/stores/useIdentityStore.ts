// stores/identityStore.ts
import { create } from "zustand";
import { ClientJS } from "clientjs";
import {
  uniqueNamesGenerator,
  adjectives,
  colors,
  animals,
} from "unique-names-generator";

function hashString(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

interface IdentityStore {
  name: string;
  fingerprint: string;
  initialized: boolean;
  initialize: () => void;
}

export const useIdentityStore = create<IdentityStore>((set, get) => ({
  name: "",
  fingerprint: "",
  initialized: false,
  initialize: () => {
    if (get().initialized) return;

    const client = new ClientJS();
    const fp = String(client.getFingerprint());
    const seed = hashString(fp);

    const generatedName = uniqueNamesGenerator({
      dictionaries: [adjectives, colors, animals],
      separator: "-",
      style: "lowerCase",
      seed,
    });

    set({ name: generatedName, fingerprint: fp, initialized: true });
  },
}));
