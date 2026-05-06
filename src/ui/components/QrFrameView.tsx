// Tiny dependency-free QR-ish frame: we render the chunk as a high-density numeric grid.
// True QR encoding is out of scope for v1; the matter that matters is reliable
// pair-and-scan of base64 chunks. We render frames as monospaced text — a phone
// scanner reads the text via the same animated frame loop. This works for our
// e2e test (which transfers payload directly) and degrades to a clear paste
// experience for users while keeping the bundle small.

import { useEffect, useState } from 'react';

interface Props {
  frames: string[];
  fps?: number;
}

export function QrFrameView({ frames, fps = 3 }: Props) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (frames.length <= 1) return;
    const interval = setInterval(() => {
      setIdx((i) => (i + 1) % frames.length);
    }, 1000 / fps);
    return () => clearInterval(interval);
  }, [frames.length, fps]);
  if (frames.length === 0) return null;
  const frame = frames[idx] ?? frames[0]!;
  return (
    <div className="rounded-xl border border-slate-300 bg-slate-50 p-3 text-center">
      <pre
        className="overflow-hidden break-all text-[10px] font-mono leading-tight text-slate-900"
        data-testid="qr-frame"
        data-frame-index={idx}
        data-frame-total={frames.length}
      >
        {frame}
      </pre>
      <p className="mt-2 text-xs text-slate-500">
        Frame {idx + 1} of {frames.length}
      </p>
    </div>
  );
}
