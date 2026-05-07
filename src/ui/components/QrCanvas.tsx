import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

interface Props {
  payload: string;
  size?: number;
}

export function QrCanvas({ payload, size = 256 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !payload) return;
    setError(null);
    QRCode.toCanvas(
      canvas,
      payload,
      { width: size, margin: 2, errorCorrectionLevel: 'M' },
      (err) => {
        if (err) setError(err.message);
      }
    );
  }, [payload, size]);

  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
        QR encoding failed ({error}). Use the paste-friendly text below instead.
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2">
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="rounded-lg border border-slate-200 bg-white"
      />
      <p className="text-[11px] text-slate-500">{payload.length} chars</p>
    </div>
  );
}
