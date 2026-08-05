// src/hooks/useFirebaseConnection.js
// v15.2.0 — Live Firebase Realtime Database connection status.
//
// Subscribes to the special `.info/connected` path, which RTDB maintains
// client-side: it flips to `true` when the socket to the backend is up and
// `false` when it drops (offline, network blip, backend unreachable). This
// is the canonical way to surface connection state — it is NOT a normal
// data path and never hits the server.
//
// Returns `{ connected, hasConnected }`.
//
// `connected` starts `false` and flips to `true` within a moment of the
// socket establishing. `hasConnected` (v16.0.0) latches `true` the first
// time we ever see a connection and never goes back.
//
// The second flag exists because `connected === false` is ambiguous on its
// own: it means BOTH "we haven't confirmed a connection yet" (the first
// moments of every page load) and "the connection dropped". Reporting the
// first case as an outage made <ConnectionStatus> flash red on every single
// load. With `hasConnected` the consumer can tell them apart:
//
//   !hasConnected && !connected  → connecting  (amber)
//   connected                    → connected   (green)
//   hasConnected && !connected   → lost        (red)

import { useEffect, useRef, useState } from "react";
import { ref, onValue } from "firebase/database";
import { db } from "../firebase.js";

export function useFirebaseConnection() {
  const [connected, setConnected] = useState(false);
  const [hasConnected, setHasConnected] = useState(false);
  // Guards against re-setting the latch on every subsequent reconnect.
  const latched = useRef(false);

  useEffect(function () {
    const connectedRef = ref(db, ".info/connected");
    const unsub = onValue(connectedRef, function (snap) {
      const isUp = snap.val() === true;
      setConnected(isUp);
      if (isUp && !latched.current) {
        latched.current = true;
        setHasConnected(true);
      }
    });
    return function () { unsub(); };
  }, []);

  return { connected: connected, hasConnected: hasConnected };
}
