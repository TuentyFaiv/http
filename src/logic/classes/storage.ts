import type { HttpStorage } from "@typing/classes/http.typing";

export class Storage implements HttpStorage {
  #vault: Map<string, string>;

  constructor() {
    this.#vault = new Map<string, string>();
  }

  getItem = (key: string) => {
    if (this.#vault.has(key)) {
      return this.#vault.get(key) ?? null;
    }

    return null;
  };

  setItem = (key: string, value: string) => {
    if (!this.#vault.has(key)) {
      this.#vault.set(key, value);
    }
  };

  removeItem = (key: string) => {
    if (this.#vault.has(key)) {
      this.#vault.delete(key);
    }
  };

}
