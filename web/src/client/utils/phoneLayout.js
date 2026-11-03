// When the app uses its phone layout (bottom tab bar, no sidebar, one pane):
//
//   - narrow screens: 768px wide or less (phones held upright, small windows);
//   - short screens:  500px tall or less (a phone turned sideways).
//
// A phone turned sideways is wide — an iPhone is 844–932px across — but only
// about 390–430px tall. The computer layout's sidebar and fixed note box then
// leave the note a strip of ~100px, so short screens get the phone layout too.
// Tablets and computer windows are taller than 500px, so they're unaffected.
//
// styles.css uses the same rule in its media queries:
//   phone:     @media (max-width: 768px), (max-height: 500px)
//   computer:  @media (min-width: 769px) and (min-height: 501px)
// Keep the two in step.

/** The media query for the phone layout (for window.matchMedia). */
export const PHONE_LAYOUT = '(max-width: 768px), (max-height: 500px)';

/** Whether the screen uses the phone layout right now. */
export const isPhoneLayout = () => typeof window !== 'undefined' && window.matchMedia(PHONE_LAYOUT).matches;
