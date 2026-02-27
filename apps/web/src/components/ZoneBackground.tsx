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

    // Load new image into inactive layer, then swap
    const inactiveLayer = activeLayer === 0 ? 1 : 0;
    setLayers((prev) => {
      const next: [string | null, string | null] = [...prev];
      next[inactiveLayer] = imageSrc;
      return next;
    });

    // Small delay to let the browser paint the new image at opacity 0 before transitioning
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setActiveLayer(inactiveLayer as 0 | 1);
      });
    });
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
