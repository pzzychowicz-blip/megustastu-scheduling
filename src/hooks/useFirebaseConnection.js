// src/hooks/useFirebaseConnection.js
// v15.2.0 — Live Firebase Realtime Database connection status.
//
// Subscribes to the special `.info/connected` path, which RTDB maintains
// client-side: it flips to `true` when the socket to the backend is up and
// `false` when it drops (offline, network blip, backend unreachable). This
// is the canonical way to surface connection state — it is NOT a normal
// data path and never hits the server.
//
// Returns a boolean. Starts `false` (honest — we haven't confirmed a
// connection yet) and flips to `true` within a moment of the socket
// establishing. Consumed by <ConnectionStatus> for the header status dot.

import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { db } from "../firebase.js";

export function useFirebaseConnection() {
  const [connected, setConnected] = useState(false);

  useEffect(function () {
    const connectedRef = ref(db, ".info/connected");
    const unsub = onValue(connectedRef, function (snap) {
      setConnected(snap.val() === true);
    });
    return function () { unsub(); };
  }, []);

  return connected;
}
