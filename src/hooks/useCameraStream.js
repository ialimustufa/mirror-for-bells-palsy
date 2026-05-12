import { useCallback, useEffect, useRef, useState } from "react";

export function useCameraStream(enabled) {
  const [stream, setStream] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const streamRef = useRef(null);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setStream(null);
  }, []);

  useEffect(() => {
    if (!enabled) {
      stopStream();
      setCameraError(null);
      return undefined;
    }

    let active = true;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((nextStream) => {
        if (!active) {
          nextStream.getTracks().forEach((track) => track.stop());
          return;
        }
        stopStream();
        streamRef.current = nextStream;
        setStream(nextStream);
        setCameraError(null);
      })
      .catch((err) => {
        if (active) setCameraError(err.message || "Camera unavailable");
      });

    return () => { active = false; };
  }, [enabled, stopStream]);

  useEffect(() => stopStream, [stopStream]);

  return { stream, cameraError };
}
