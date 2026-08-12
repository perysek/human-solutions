import { ICON_PATHS } from './paths';

export interface IconProps {
  /** Key into ICON_PATHS. Unknown name falls back to "info" (never blank) — mirrors icons.html. */
  name: string;
  className?: string;
  style?: React.CSSProperties;
  /** Explicit width/height in px. Omit to size by font-size (1em), the default. */
  size?: number;
}

/**
 * Inline-SVG icon — the React equivalent of the Jinja `icon()` macro in
 * templates/components/icons.html. Same contract: fill="currentColor" so it
 * takes the surrounding text color, sized to 1em by default, aria-hidden
 * because icons are always decorative (the interactive element that hosts
 * one is responsible for its own aria-label).
 *
 * Adding a glyph: add its `<path d="…"/>` to ICON_PATHS in ./paths.ts. That
 * is the only sanctioned way to extend the icon set — never inline a raw
 * <svg> at a call site.
 */
export function Icon({ name, className = '', style, size }: IconProps) {
  const markup = ICON_PATHS[name] ?? ICON_PATHS.info;
  return (
    <svg
      className={`icon ${className}`.trim()}
      viewBox="0 -960 960 960"
      fill="currentColor"
      style={style}
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
