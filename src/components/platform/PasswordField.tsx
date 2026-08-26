"use client";

import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";

/**
 * A password input with a reveal toggle, for the team console.
 *
 * Drop-in for a bare <input type="password">: pass the same props, including
 * the page-local `field` style object, and it renders identically with an eye
 * button pinned inside the right edge. The console is styled inline rather than
 * with Tailwind utilities (src/index.css is a frozen pre-compiled build), which
 * is why the positioning here is inline too.
 *
 * Vertical margins are lifted off the input and onto the wrapper. Without that,
 * the `marginTop` every console `field` carries would grow the positioning
 * context and leave the button sitting half a margin below centre.
 *
 * A reveal only ever shows what the person at the keyboard just typed. Nothing
 * here can show a STORED password: those are one-way bcrypt hashes and no API
 * response carries them.
 */
export function PasswordField({
  style,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [show, setShow] = useState(false);
  const { marginTop, marginBottom, margin, width, ...inputStyle } = style ?? {};

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        margin,
        marginTop,
        marginBottom,
        width: width ?? "100%",
      }}
    >
      <input
        {...props}
        type={show ? "text" : "password"}
        style={{ ...inputStyle, width: "100%", paddingRight: 36 }}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        tabIndex={-1}
        aria-label={show ? "Hide password" : "Show password"}
        style={{
          position: "absolute",
          right: 8,
          top: "50%",
          transform: "translateY(-50%)",
          color: "#9CA3AF",
          padding: 4,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          lineHeight: 0,
        }}
      >
        {show ? (
          <EyeOffIcon style={{ width: 16, height: 16 }} />
        ) : (
          <EyeIcon style={{ width: 16, height: 16 }} />
        )}
      </button>
    </div>
  );
}
