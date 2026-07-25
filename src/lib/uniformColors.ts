export interface UniformColorOption {
  label: string;
  hex: string;
  border: boolean;
}

export const UNIFORM_COLORS: UniformColorOption[] = [
  { label: "White",        hex: "#FFFFFF",  border: true  },
  { label: "Sky Blue",     hex: "#87CEEB",  border: false },
  { label: "Navy",         hex: "#001f5b",  border: false },
  { label: "Khaki",        hex: "#C3B091",  border: false },
  { label: "Maroon",       hex: "#800000",  border: false },
  { label: "Forest Green", hex: "#228B22",  border: false },
  { label: "Grey",         hex: "#808080",  border: false },
  { label: "Black",        hex: "#000000",  border: false },
  { label: "Yellow",       hex: "#FFD700",  border: false },
  { label: "Red",          hex: "#DC143C",  border: false },
];

export type UniformGarment = "shirt" | "trouser" | "gown";

export interface UniformColors {
  shirt: string | null;
  trouser: string | null;
  gown: string | null;
}

export const EMPTY_UNIFORM_COLORS: UniformColors = {
  shirt: null,
  trouser: null,
  gown: null,
};

export function hexForLabel(label: string | null): string | undefined {
  if (!label) return undefined;
  return UNIFORM_COLORS.find((c) => c.label === label)?.hex;
}
