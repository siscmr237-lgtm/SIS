"use client";

import { useEffect, useState } from 'react';
import { api } from './api';

/** A class this teacher is class teacher (pastoral head) of. */
export interface ClassTeacherOf {
  id: number;
  code: string;
  name: string;
}

/**
 * One (class, subject) pairing this teacher teaches.
 *
 * className/subjectName are nullable because the server resolves them from a
 * separate lookup and emits null when the row has gone missing — the pairing
 * still authorizes the teacher, so it must not be dropped from the list just
 * because a label failed to resolve.
 */
export interface SubjectAssignment {
  classId: number;
  className: string | null;
  subjectId: number;
  subjectName: string | null;
}

export interface TeacherAssignments {
  classTeacherOf: ClassTeacherOf[];
  subjectAssignments: SubjectAssignment[];
}

/**
 * GET /staff/me/assignments — what this teacher is allowed to act on.
 *
 * Read live rather than through SisCache: the cache's key union is closed to
 * reference data, and an assignment revoked by an admin is exactly the kind of
 * thing that must not be served from a tab that has been open for ten minutes.
 */
export function useTeacherAssignments() {
  const [data, setData] = useState<TeacherAssignments | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .get('/staff/me/assignments')
      .then((res: any) => {
        if (!alive) return;
        setData({
          classTeacherOf: res?.classTeacherOf ?? [],
          subjectAssignments: res?.subjectAssignments ?? [],
        });
      })
      .catch((e: any) => {
        if (alive) setError(e?.message || 'Failed to load your assignments.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { data, loading, error };
}
