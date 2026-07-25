"use client";

import { useEffect, useRef, useState } from "react";
import {
  UNIFORM_COLORS,
  UniformColors,
  UniformGarment,
  hexForLabel,
} from "../../lib/uniformColors";

const NEUTRAL_FILL = "#E5E7EB";
const OUTLINE = "#374151";

function ShirtIllustration({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 100 120" width="76" height="88">
      <path
        d="M30,22 L42,22 L50,34 L58,22 L70,22 L70,96 L30,96 Z"
        fill={color}
        stroke={OUTLINE}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <path
        d="M30,22 L14,26 L14,46 L30,46 Z"
        fill={color}
        stroke={OUTLINE}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <path
        d="M70,22 L86,26 L86,46 L70,46 Z"
        fill={color}
        stroke={OUTLINE}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <path
        d="M40,22 L50,32 L60,22"
        fill="none"
        stroke={OUTLINE}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <line x1="50" y1="34" x2="50" y2="94" stroke={OUTLINE} strokeWidth={1.5} />
      {[44, 56, 68, 80, 92].map((y) => (
        <circle key={y} cx="50" cy={y} r="2.2" fill={OUTLINE} />
      ))}
    </svg>
  );
}

function TrouserIllustration({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 100 120" width="76" height="88">
      <path
        d="M22,26 L78,26 L78,82 L55,82 L50,64 L45,82 L22,82 Z"
        fill={color}
        stroke={OUTLINE}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      {[27, 37, 63, 73].map((x) => (
        <rect
          key={x}
          x={x}
          y="22"
          width="5"
          height="16"
          rx="1.5"
          fill={color}
          stroke={OUTLINE}
          strokeWidth={1.5}
        />
      ))}
      <rect x="20" y="28" width="60" height="8" rx="2" fill="#4B5563" stroke={OUTLINE} strokeWidth={1.5} />
      <rect x="45" y="28" width="10" height="8" rx="1.5" fill="#9CA3AF" stroke={OUTLINE} strokeWidth={1.5} />
    </svg>
  );
}

function GownIllustration({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 100 120" width="76" height="88">
      <rect x="34" y="14" width="10" height="10" rx="3" fill={color} stroke={OUTLINE} strokeWidth={2} />
      <rect x="56" y="14" width="10" height="10" rx="3" fill={color} stroke={OUTLINE} strokeWidth={2} />
      <path
        d="M38,20 L50,30 L62,20 L58,56 L80,90 L20,90 L42,56 Z"
        fill={color}
        stroke={OUTLINE}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <line x1="42" y1="56" x2="58" y2="56" stroke={OUTLINE} strokeWidth={1.5} />
    </svg>
  );
}

const GARMENTS: {
  key: UniformGarment;
  label: string;
  Illustration: React.ComponentType<{ color: string }>;
}[] = [
  { key: "shirt", label: "Shirt", Illustration: ShirtIllustration },
  { key: "trouser", label: "Trousers", Illustration: TrouserIllustration },
  { key: "gown", label: "Gown", Illustration: GownIllustration },
];

interface UniformColorPickerProps {
  value: UniformColors;
  onChange: (next: UniformColors) => void;
}

export function UniformColorPicker({ value, onChange }: UniformColorPickerProps) {
  const [openGarment, setOpenGarment] = useState<UniformGarment | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openGarment) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenGarment(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenGarment(null);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openGarment]);

  const selectColor = (garment: UniformGarment, label: string) => {
    onChange({
      ...value,
      [garment]: value[garment] === label ? null : label,
    });
    setOpenGarment(null);
  };

  return (
    <div ref={containerRef} style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
      {GARMENTS.map(({ key, label, Illustration }) => {
        const selectedLabel = value[key];
        const fill = selectedLabel ? hexForLabel(selectedLabel) ?? NEUTRAL_FILL : NEUTRAL_FILL;
        const isOpen = openGarment === key;

        return (
          <div key={key} style={{ position: "relative", textAlign: "center" }}>
            <button
              type="button"
              onClick={() => setOpenGarment(isOpen ? null : key)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                padding: "10px 14px",
                borderRadius: 12,
                border: `2px solid ${selectedLabel ? "#1e3a8a" : "#E5E7EB"}`,
                background: selectedLabel ? "#EFF6FF" : "white",
                cursor: "pointer",
                transition: "border-color 0.15s, background 0.15s",
              }}
            >
              <Illustration color={fill} />
              <span
                style={{
                  fontSize: "0.8rem",
                  fontWeight: selectedLabel ? 600 : 500,
                  color: selectedLabel ? "#1e3a8a" : "#374151",
                }}
              >
                {label}
              </span>
            </button>

            {isOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  left: "50%",
                  transform: "translateX(-50%)",
                  zIndex: 20,
                  background: "white",
                  borderRadius: 12,
                  border: "1.5px solid #E5E7EB",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                  padding: 12,
                  width: 168,
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(5, 1fr)",
                    gap: 8,
                  }}
                >
                  {UNIFORM_COLORS.map((c) => {
                    const active = selectedLabel === c.label;
                    return (
                      <button
                        key={c.label}
                        type="button"
                        title={c.label}
                        onClick={() => selectColor(key, c.label)}
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          backgroundColor: c.hex,
                          border: active
                            ? "2px solid #1e3a8a"
                            : c.border
                            ? "1px solid #D1D5DB"
                            : "1px solid transparent",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
