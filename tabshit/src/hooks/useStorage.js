import { useState, useEffect, useRef, useCallback } from "react";

const hasChromeStorage = () =>
  typeof chrome !== "undefined" && !!chrome.storage?.local;

const LOCAL_PREFIX = "tabshit:";
const localListeners = new Set();

/**
 * Minimal storage adapter. Uses chrome.storage.local inside the extension and
 * falls back to window.localStorage when running as a plain web page
 * (e.g. `npm run dev`), so the UI can be developed outside Chrome.
 */
export const storage = {
  get(key) {
    if (hasChromeStorage()) {
      return chrome.storage.local.get([key]).then((result) => result[key]);
    }
    try {
      const raw = window.localStorage.getItem(LOCAL_PREFIX + key);
      return Promise.resolve(raw === null ? undefined : JSON.parse(raw));
    } catch (err) {
      return Promise.reject(err);
    }
  },
  set(key, value) {
    if (hasChromeStorage()) {
      return chrome.storage.local.set({ [key]: value });
    }
    try {
      window.localStorage.setItem(LOCAL_PREFIX + key, JSON.stringify(value));
      localListeners.forEach((fn) => fn({ [key]: { newValue: value } }));
      return Promise.resolve();
    } catch (err) {
      return Promise.reject(err);
    }
  },
  subscribe(listener) {
    if (hasChromeStorage()) {
      const wrapped = (changes, areaName) => {
        if (areaName === undefined || areaName === "local") listener(changes);
      };
      chrome.storage.onChanged.addListener(wrapped);
      return () => chrome.storage.onChanged.removeListener(wrapped);
    }
    const onStorage = (e) => {
      if (!e.key || !e.key.startsWith(LOCAL_PREFIX)) return;
      const key = e.key.slice(LOCAL_PREFIX.length);
      try {
        listener({
          [key]: { newValue: e.newValue === null ? undefined : JSON.parse(e.newValue) },
        });
      } catch (err) {
        console.error(`[useStorage] Could not parse "${key}" from another tab`, err);
      }
    };
    // "storage" events only fire in other tabs; same-tab writes go through localListeners.
    window.addEventListener("storage", onStorage);
    localListeners.add(listener);
    return () => {
      window.removeEventListener("storage", onStorage);
      localListeners.delete(listener);
    };
  },
};

/**
 * Sync a piece of state with extension storage.
 *
 * @template T
 * @param {string} key storage key
 * @param {T} initialValue used until (and unless) a stored value is loaded
 * @returns {[T, (next: T | ((prev: T) => T)) => void, boolean]} value, setter, isLoaded
 */
export function useStorage(key, initialValue) {
  const [value, setValue] = useState(initialValue);
  const [isLoaded, setIsLoaded] = useState(false);
  const valueRef = useRef(initialValue);
  // True once the user changed the value locally; a late initial load must not overwrite it.
  const touchedRef = useRef(false);
  // Serialized values we wrote ourselves; their onChanged echo is ignored.
  const pendingWritesRef = useRef([]);
  // Value to fall back to when the key is removed from storage.
  const initialValueRef = useRef(initialValue);

  useEffect(() => {
    let cancelled = false;

    storage
      .get(key)
      .then((stored) => {
        if (cancelled) return;
        if (stored !== undefined && !touchedRef.current) {
          valueRef.current = stored;
          setValue(stored);
        }
      })
      .catch((err) => console.error(`[useStorage] Failed to load "${key}"`, err))
      .finally(() => {
        if (!cancelled) setIsLoaded(true);
      });

    const unsubscribe = storage.subscribe((changes) => {
      if (!(key in changes)) return;
      const { newValue } = changes[key];
      const serialized = JSON.stringify(newValue);
      const pending = pendingWritesRef.current;
      const idx = pending.indexOf(serialized);
      if (idx !== -1) {
        // Echo of our own write. Drop it and anything older.
        pending.splice(0, idx + 1);
        return;
      }
      const next = newValue === undefined ? initialValueRef.current : newValue;
      valueRef.current = next;
      setValue(next);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [key]);

  const updateValue = useCallback(
    (next) => {
      const resolved =
        typeof next === "function" ? next(valueRef.current) : next;
      if (resolved === valueRef.current) return;
      touchedRef.current = true;
      valueRef.current = resolved;
      setValue(resolved);

      const pending = pendingWritesRef.current;
      pending.push(JSON.stringify(resolved));
      if (pending.length > 20) pending.shift();

      storage.set(key, resolved).catch((err) => {
        console.error(`[useStorage] Failed to save "${key}"`, err);
      });
    },
    [key],
  );

  return [value, updateValue, isLoaded];
}
