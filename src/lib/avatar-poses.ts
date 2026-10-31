// The 18 poses of the Saudi guide, split from avatar/1.png, 2.png, 3.png by scripts/split-avatar-sheets.mjs (pose-<sheet>-<n>.png).
// Names describe what the pose DOES on screen. "Right"/"left" are screen directions (the side of the screen the hand points to).
const P = (sheet: number, n: number) => `/avatar/pose-${sheet}-${n}.png`;

export const POSES = {
  // sheet 1 — points / presents to the screen's right
  presentRight: P(1, 1), pointRight: P(1, 2), welcome: P(1, 3), pointRightProfile: P(1, 4), pointRightBack: P(1, 5), thumbRight: P(1, 6),
  // sheet 2 — tablet, finger up, profile presenting right, thinking, thumbs-up, back view pointing up
  tabletPresentRight: P(2, 1), pointUp: P(2, 2), presentRightProfile: P(2, 3), thinking: P(2, 4), thumbsUp: P(2, 5), pointUpBack: P(2, 6),
  // sheet 3 — points / presents to the screen's left
  pointLeft: P(3, 1), pointLeftWide: P(3, 2), presentLeft: P(3, 3), pointLeftBack: P(3, 4), tabletPointLeft: P(3, 5), pointLeftFront: P(3, 6),
} as const;

export type PoseName = keyof typeof POSES;
export const ALL_POSE_PATHS: string[] = Object.values(POSES);
