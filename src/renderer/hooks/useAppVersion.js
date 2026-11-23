import { useState, useEffect, useCallback } from 'react';

/* global __APP_VERSION__ */
const BUILD_VERSION = typeof __APP_VERSION__ !== 'undefined' ? String(__APP_VERSION__) : '1.0.0';

let cachedInfo = {
  version: BUILD_VERSION,
  edition: null, // 'master' | 'branch' | null
  resolved: false,
};

let inflightPromise = null;

async function fetchRuntimeVersionInfo() {
  if (cachedInfo.resolved) return cachedInfo;
  if (inflightPromise) return inflightPromise;

  inflightPromise = (async () => {
    let version = BUILD_VERSION;
    let edition = null;

    try {
      if (typeof window !== 'undefined' && window.electronAPI?.updater?.getStatus) {
        const status = await window.electronAPI.updater.getStatus();
        if (status?.currentVersion) version = String(status.currentVersion);
        if (status?.edition) edition = String(status.edition).toLowerCase();
      }
    } catch {}

    if (!edition) {
      try {
        const res = await fetch('/api/server-time', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data?.app_version && version === BUILD_VERSION) {
            version = String(data.app_version);
          }
          if (data?.edition) {
            edition = String(data.edition).toLowerCase();
          }
        }
      } catch {}
    }

    cachedInfo = { version, edition, resolved: true };
    return cachedInfo;
  })();

  try {
    return await inflightPromise;
  } finally {
    inflightPromise = null;
  }
}

export function useAppVersion() {
  const isElectron = Boolean(typeof window !== 'undefined' && window.electronAPI?.isElectron);
  const [info, setInfo] = useState(() => ({
    version: cachedInfo.version || BUILD_VERSION,
    edition: cachedInfo.edition,
  }));
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetchRuntimeVersionInfo().then((resolved) => {
      if (mounted) {
        setInfo({ version: resolved.version, edition: resolved.edition });
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const checkForUpdates = useCallback(async () => {
    if (!isElectron || !window.electronAPI?.updater?.checkForUpdates) {
      return { supported: false };
    }
    setCheckingUpdate(true);
    try {
      const result = await window.electronAPI.updater.checkForUpdates();
      return { supported: true, result };
    } finally {
      setCheckingUpdate(false);
    }
  }, [isElectron]);

  return {
    version: info.version,
    edition: info.edition,
    isElectron,
    checkingUpdate,
    checkForUpdates,
  };
}

export default useAppVersion;
