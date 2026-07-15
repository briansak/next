export type SpacePurpose = "PRIORITIES" | "TECHNOLOGY";

export interface SpacePurposeMetadata {
  spacePurpose?: SpacePurpose;
  spaceTitle?: string;
  technologyLabel?: string;
  roomId?: string;
}

export function communicationSpacePurpose(
  metadata: unknown
): SpacePurpose | undefined {
  const meta = (metadata ?? {}) as SpacePurposeMetadata;
  return meta.spacePurpose;
}

export function isTechnologyCommunication(metadata: unknown): boolean {
  return communicationSpacePurpose(metadata) === "TECHNOLOGY";
}

export function isPrioritiesCommunication(
  source: string,
  metadata: unknown
): boolean {
  if (source !== "WEBEX") return true;
  const purpose = communicationSpacePurpose(metadata);
  return purpose !== "TECHNOLOGY";
}
