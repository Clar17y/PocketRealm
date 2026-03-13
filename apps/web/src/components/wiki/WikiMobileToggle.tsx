'use client';

import { useState } from 'react';
import { WikiSidebar } from './WikiSidebar';

export function WikiMobileToggle() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        className="wiki-mobile-overlay"
        data-open={open}
        onClick={() => setOpen(false)}
      />
      <WikiSidebar open={open} onClose={() => setOpen(false)} mobile />
      <button
        className="wiki-mobile-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-label="Toggle wiki navigation"
      >
        {open ? '\u2715' : '\u2630'}
      </button>
    </>
  );
}
