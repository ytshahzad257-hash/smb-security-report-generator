export function maskId(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  if (value.length <= 8) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function maskToken(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  if (value.length <= 9) {
    return `${value.slice(0, 3)}...`;
  }

  return `${value.slice(0, 6)}...${value.slice(-3)}`;
}
