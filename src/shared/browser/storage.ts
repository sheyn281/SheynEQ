export interface LocalStorageArea {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
}

class ChromeLocalStorage implements LocalStorageArea {
  async get<T>(key: string): Promise<T | undefined> {
    const value = await chrome.storage.local.get(key);
    return value[key] as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    await chrome.storage.local.set({ [key]: value });
  }
}

class BrowserLocalStorage implements LocalStorageArea {
  async get<T>(key: string): Promise<T | undefined> {
    const rawValue = window.localStorage.getItem(key);
    return rawValue ? (JSON.parse(rawValue) as T) : undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    window.localStorage.setItem(key, JSON.stringify(value));
  }
}

export const localStorageArea: LocalStorageArea =
  typeof chrome !== 'undefined' && chrome.storage?.local
    ? new ChromeLocalStorage()
    : new BrowserLocalStorage();
