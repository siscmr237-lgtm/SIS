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

/** A subject this teacher may record marks for in a given class. */
export interface TeachingSubject {
  id: number;
  name: string;
}

/**
 * One class this teacher may work in.
 *
 * `isClassTeacher` distinguishes the two ways they got here, which decides what
 * `subjects` contains: every subject the class's level teaches when they are its
 * class teacher, or only their specifically assigned ones when they are not.
 */
export interface TeachingClass {
  id: number;
  code: string;
  name: string;
  isClassTeacher: boolean;
  subjects: TeachingSubject[];
  studentCount: number;
}

/**
 * GET /staff/me/teaching — the classes and subjects this teacher may act on.
 *
 * The server computes this with the same rule its marks endpoints enforce, so
 * everything offered here is something the server will accept. Nothing is
 * derived client-side from raw class or subject lists: that would turn a
 * boundary into a suggestion.
 *
 * Read live rather than through SisCache, for the same reason as
 * useTeacherAssignments — an assignment an admin has just revoked must not be
 * served out of a long-open tab.
 */
export function useTeacherTeaching() {
  const [data, setData] = useState<TeachingClass[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .get('/staff/me/teaching')
      .then((res: any) => {
        if (!alive) return;
        setData(Array.isArray(res?.classes) ? res.classes : []);
      })
      .catch((e: any) => {
        if (alive) setError(e?.message || 'Failed to load your classes.');
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
