'use client';

import { useEffect, useState } from 'react';
import { REPORT_TERMS } from '../lib/reportCard';
import { Button } from './ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from './ui/dialog';
import { Label } from './ui/label';

/**
 * Which terms a report card covers.
 *
 * Asked every time rather than remembered, because it is the one decision that
 * changes what the document MEANS — an end-of-year card and a first-term card
 * are different reports, and defaulting silently to one of them would produce
 * the wrong document without saying so.
 *
 * Multiple selection; at least one is required, so the button is disabled rather
 * than producing an empty card.
 */
export function ReportCardTermDialog({
  open,
  onOpenChange,
  onConfirm,
  title = 'Download report card',
  busy = false,
  progress,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (terms: string[]) => void;
  title?: string;
  busy?: boolean;
  progress?: string | null;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // A fresh choice each time it opens — see above.
  useEffect(() => { if (open) setSelected(new Set()); }, [open]);

  const toggle = (t: string) => {
    const next = new Set(selected);
    if (next.has(t)) next.delete(t); else next.add(t);
    setSelected(next);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      {/* Width inline: max-w-md is not in the pre-compiled stylesheet. */}
      <DialogContent style={{ maxWidth: 448 }}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Choose which terms to include. The marks, attendance and overall result all cover only
            the terms selected here.
          </DialogDescription>
        </DialogHeader>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          <Label>Terms</Label>
          {REPORT_TERMS.map((t) => (
            <label
              key={t}
              style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: busy ? 'default' : 'pointer' }}
            >
              <input
                type="checkbox"
                checked={selected.has(t)}
                onChange={() => toggle(t)}
                disabled={busy}
              />
              <span className="text-sm">{t}</span>
            </label>
          ))}
        </div>

        {progress && <p className="text-sm text-gray-500" style={{ marginTop: 8 }}>{progress}</p>}

        <div className="flex items-center justify-end gap-2" style={{ marginTop: 12 }}>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={() => onConfirm([...selected])} disabled={busy || selected.size === 0}>
            {busy ? 'Generating...' : 'Download'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
