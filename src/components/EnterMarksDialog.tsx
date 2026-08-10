'use client';

import { useEffect, useState } from 'react';
import { AcademicYearSelect, useAcademicYear } from '@/lib/academicYear';
import { EnterMarksFlow } from './EnterMarksFlow';
import { Button } from './ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from './ui/dialog';
import { Label } from './ui/label';

/**
 * The admin mark-entry dialog.
 *
 * A thin shell around EnterMarksFlow, which the teacher portal renders too — the
 * two surfaces were drifting apart when each had its own copy, and mark entry is
 * the one screen where a difference between them is a data problem rather than a
 * cosmetic one. Everything except the academic-year control and the dialog
 * chrome lives in the shared component.
 *
 * The year stays here because only an admin may look at a year other than the
 * school's active one; a teacher always works in the current year.
 */
export function EnterMarksDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { status: yearStatus } = useAcademicYear();
  const [academicYear, setAcademicYear] = useState('');

  useEffect(() => {
    if (!academicYear && yearStatus?.activeYear) setAcademicYear(yearStatus.activeYear);
  }, [yearStatus, academicYear]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl"
        style={{ display: 'flex', flexDirection: 'column', maxHeight: '90vh', overflow: 'hidden' }}
      >
        <DialogHeader>
          <DialogTitle>Enter Marks</DialogTitle>
          <DialogDescription>
            Pick a class, term, assessment and subject, then enter each student's score — saving
            keeps this open so you can move straight to the next subject.
          </DialogDescription>
        </DialogHeader>

        <div style={{ overflowY: 'auto', minHeight: 0, flex: 1 }}>
          <div style={{ marginBottom: '0.75rem' }}>
            <Label>Academic Year</Label>
            <AcademicYearSelect
              value={academicYear}
              onChange={setAcademicYear}
              years={yearStatus?.years ?? []}
            />
          </div>

          <EnterMarksFlow audience="admin" academicYear={academicYear} active={open} />
        </div>

        <div className="flex items-center justify-end" style={{ paddingTop: '0.75rem' }}>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
