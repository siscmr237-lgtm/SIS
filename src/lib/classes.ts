export const SCHOOL_CLASSES = [
  "Day Care",
  "Pre-Nursery",
  "Nursery 1",
  "Nursery 2",
  "Class 1",
  "Class 2",
  "Class 3",
  "Class 4",
  "Class 5",
  "Class 6",
] as const;

export type SchoolClass = typeof SCHOOL_CLASSES[number];
