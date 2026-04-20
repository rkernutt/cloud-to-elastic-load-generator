import type { SimpleIcon } from "simple-icons";

/** Render a Simple Icons glyph (24×24, brand HEX fill). */
export function SimpleBrandIcon({ icon, size = 28 }: { icon: SimpleIcon; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path fill={`#${icon.hex}`} d={icon.path} />
    </svg>
  );
}
