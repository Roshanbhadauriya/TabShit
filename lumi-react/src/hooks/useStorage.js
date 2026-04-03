import { useState, useEffect } from 'react';

/**
 * Custom hook to sync state with chrome.storage.local
 * @param {string} key - The storage key
 * @param {any} initialValue - Initial value if none exists
 * @returns {[any, Function]}
 */
export function useStorage(key, initialValue) {
  const [value, setValue] = useState(initialValue);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Initial Load
    chrome.storage.local.get([key], (result) => {
      if (result[key] !== undefined) {
        setValue(result[key]);
      }
      setIsLoaded(true);
    });

    // Listen for changes
    const listener = (changes) => {
      if (changes[key]) {
        setValue(changes[key].newValue);
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [key]);

  const updateValue = (newValue) => {
    setValue((prevValue) => {
      const updated =
        typeof newValue === "function" ? newValue(prevValue) : newValue;
      chrome.storage.local.set({ [key]: updated });
      return updated;
    });
  };

  return [value, updateValue, isLoaded];
}
