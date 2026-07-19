import { AttributeKey } from './types';

/**
 * Categorical color slot per attribute, in fixed order (never cycled/reassigned)
 * matching the CSS custom properties defined in app/globals.css. The order
 * was chosen to preserve the validated worst-adjacent-pair CVD separation
 * against the order these attributes are actually displayed adjacently in
 * (Skills page sections, onboarding groups, Analytics attribute grid) - see
 * the dataviz skill's palette.md for the source palette and validation.
 */
const ATTRIBUTE_COLOR_VAR: Record<AttributeKey, string> = {
  PHYSICAL: '--attr-physical',
  INTELLIGENCE: '--attr-intelligence',
  DISCIPLINE: '--attr-discipline',
  ENERGY: '--attr-energy',
  SOCIAL: '--attr-social',
  WEALTH: '--attr-wealth',
  CREATIVITY: '--attr-creativity',
  WISDOM: '--attr-wisdom',
};

/** CSS color value for an attribute, theme-aware via the custom property. Pass `alpha` (0-1) for a translucent fill. */
export function attributeColor(key: AttributeKey, alpha?: number): string {
  const cssVar = `var(${ATTRIBUTE_COLOR_VAR[key]})`;
  return alpha === undefined ? `rgb(${cssVar})` : `rgb(${cssVar} / ${alpha})`;
}
