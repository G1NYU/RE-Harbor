// The card-only appearance block added to the profile summary by
// ecosystem/social/card-appearance.js. Kept beside the card module rather than inline in
// profile-types so the shape and the module that produces it stay together.
export type ProfileCardAppearance = {
  theme: string | null;
  gradient: string | null;
  from: string | null;
  to: string | null;
  accent: string | null;
  nameColor?: string | null;
  handleColor?: string | null;
  bioColor?: string | null;
  textColor?: string | null;
  bgUrl: string | null;
  bgKind: "image" | "gif" | null;
  customised: boolean;
};
