import { useEffect, useRef, useState } from 'react';
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser';

interface Props {
  onResult: (text: string) => void;
  onError?: (err: unknown) => void;
}

export function QrScanner({ onResult, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [status, setStatus] = useState('Starting camera…');

  useEffect(() => {
    const reader = new BrowserQRCodeReader();
    let cancelled = false;
    let decoded = false;
    (async () => {
      try {
        const devices = await BrowserQRCodeReader.listVideoInputDevices();
        if (devices.length === 0) throw new Error('No camera found');
        const back = devices.find((d) => /back|rear|environment/i.test(d.label)) ?? devices[0]!;
        if (cancelled) return;
        setStatus('Point the back camera at the QR. Hold steady.');
        const controls = await reader.decodeFromVideoDevice(
          back.deviceId,
          videoRef.current!,
          (result, err, ctl) => {
            if (cancelled || decoded) {
              ctl.stop();
              return;
            }
            if (result) {
              decoded = true;
              ctl.stop();
              setStatus('Scanned. Processing…');
              onResult(result.getText());
            } else if (err && err.name !== 'NotFoundException') {
              onError?.(err);
            }
          }
        );
        controlsRef.current = controls;
      } catch (err) {
        setStatus(`Camera unavailable: ${String((err as Error).message ?? err)}`);
        onError?.(err);
      }
    })();
    return () => {
      cancelled = true;
      controlsRef.current?.stop();
    };
  }, [onResult, onError]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-black">
      <video ref={videoRef} className="w-full" autoPlay muted playsInline />
      <p className="bg-slate-900 px-2 py-1 text-center text-[11px] text-slate-100">{status}</p>
    </div>
  );
}
