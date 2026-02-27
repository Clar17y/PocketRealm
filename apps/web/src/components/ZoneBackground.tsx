'use client';

import { useEffect, useRef, useState } from 'react';

interface ZoneBackgroundProps {
  imageSrc?: string;
}

export function ZoneBackground({ imageSrc }: ZoneBackgroundProps) {
  const visible = Boolean(imageSrc);

  // Track two layers for crossfade
  const [layers, setLayers] = useState<[string | null, string | null]>([null, null]);
  const [activeLayer, setActiveLayer] = useState<0 | 1>(0);
  const prevSrc = useRef<string | null>(null);

  useEffect(() => {
    if (!imageSrc || imageSrc === prevSrc.current) return;
    prevSrc.current = imageSrc;

    const inactiveLayer = activeLayer === 0 ? 1 : 0;

    // Preload the image before triggering the crossfade
    const img = new Image();
    let cancelled = false;

    img.onload = () => {
      if (cancelled) return;
      setLayers((prev) => {
        const next: [string | null, string | null] = [...prev];
        next[inactiveLayer] = imageSrc;
        return next;
      });

      // Let the browser paint the new image at opacity 0 before transitioning
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!cancelled) setActiveLayer(inactiveLayer as 0 | 1);
        });
      });
    };

    img.src = imageSrc;

    return () => { cancelled = true; };
  }, [imageSrc, activeLayer]);

  return (
    <div
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 1 }}
      aria-hidden="true"
    >
      {/* Layer 0 */}
      {layers[0] && (
        <img
          src={layers[0]}
          alt=""
          className="absolute inset-0 w-full h-full object-cover image-rendering-pixelated"
          style={{
            opacity: visible && activeLayer === 0 ? 0.15 : 0,
            transition: 'opacity 500ms ease',
          }}
        />
      )}
      {/* Layer 1 */}
      {layers[1] && (
        <img
          src={layers[1]}
          alt=""
          className="absolute inset-0 w-full h-full object-cover image-rendering-pixelated"
          style={{
            opacity: visible && activeLayer === 1 ? 0.15 : 0,
            transition: 'opacity 500ms ease',
          }}
        />
      )}
    </div>
  );
}
