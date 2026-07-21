export type SpacePurpose = "PRIORITIES" | "DEAL" | "TECHNOLOGY";

export interface SpacePurposeMetadata {
  spacePurpose?: SpacePurpose;
  spaceTitle?: string;
  technologyLabel?: string;
  dealLabel?: string;
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

export function isDealCommunication(metadata: unknown): boolean {
  return communicationSpacePurpose(metadata) === "DEAL";
}

export function isPrioritiesCommunication(
  source: string,
  metadata: unknown
): boolean {
  if (source !== "WEBEX") return true;
  const purpose = communicationSpacePurpose(metadata);
  return purpose !== "TECHNOLOGY" && purpose !== "DEAL";
}

/** Day-job scope for commitments: priority Webex spaces, email, and meetings — not Technologies or deal spaces. */
export function isDayJobCommunication(
  source: string,
  metadata: unknown
): boolean {
  switch (source) {
    case "EMAIL":
      return true;
    case "WEBEX_MEETING":
      return true;
    case "WEBEX": {
      const purpose = communicationSpacePurpose(metadata);
      if (purpose === "TECHNOLOGY" || purpose === "DEAL") return false;
      return purpose === "PRIORITIES" || purpose === undefined;
    }
    default:
      return false;
  }
}
