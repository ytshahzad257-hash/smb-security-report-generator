const hexColorPattern = /^#[0-9a-fA-F]{6}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AgencyProfileInput = {
  agencyName: string;
  primaryColor: string;
  secondaryColor?: string | null;
  contactEmail?: string | null;
  websiteUrl?: string | null;
  address?: string | null;
  footerText: string;
  showPoweredBy: boolean;
};

export type AgencyProfileValidationResult =
  | { data: AgencyProfileInput; success: true }
  | { errors: Record<string, string>; success: false };

function cleanOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function isValidHexColor(value: string) {
  return hexColorPattern.test(value);
}

export function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateAgencyProfileInput(
  input: Record<string, unknown>,
): AgencyProfileValidationResult {
  const errors: Record<string, string> = {};
  const agencyName = cleanString(input.agencyName);
  const primaryColor = cleanString(input.primaryColor) || "#0f172a";
  const secondaryColor = cleanOptionalString(input.secondaryColor);
  const contactEmail = cleanOptionalString(input.contactEmail);
  const websiteUrl = cleanOptionalString(input.websiteUrl);
  const address = cleanOptionalString(input.address);
  const footerText = cleanString(input.footerText) || "Prepared for client review";
  const showPoweredBy = input.showPoweredBy === true;

  if (agencyName.length < 2 || agencyName.length > 80) {
    errors.agencyName = "Agency name must be between 2 and 80 characters.";
  }

  if (!isValidHexColor(primaryColor)) {
    errors.primaryColor = "Primary color must be a valid hex color.";
  }

  if (secondaryColor && !isValidHexColor(secondaryColor)) {
    errors.secondaryColor = "Secondary color must be a valid hex color.";
  }

  if (contactEmail && !emailPattern.test(contactEmail)) {
    errors.contactEmail = "Contact email must be a valid email address.";
  }

  if (websiteUrl && !isValidHttpUrl(websiteUrl)) {
    errors.websiteUrl = "Website URL must start with http:// or https://.";
  }

  if (address && address.length > 240) {
    errors.address = "Address must be 240 characters or fewer.";
  }

  if (footerText.length > 160) {
    errors.footerText = "Footer text must be 160 characters or fewer.";
  }

  if (Object.keys(errors).length > 0) {
    return { errors, success: false };
  }

  return {
    data: {
      address,
      agencyName,
      contactEmail,
      footerText,
      primaryColor: primaryColor.toLowerCase(),
      secondaryColor: secondaryColor?.toLowerCase() ?? null,
      showPoweredBy,
      websiteUrl,
    },
    success: true,
  };
}

export function getAgencyDefaults(user: { name: string | null }) {
  return {
    agencyName: user.name?.trim() || "Agency",
    primaryColor: "#0f172a",
    secondaryColor: null,
    contactEmail: null,
    websiteUrl: null,
    address: null,
    footerText: "Prepared for client review",
    showPoweredBy: true,
  };
}
