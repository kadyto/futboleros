const origin = "https://www.rffm.es";

export function teamProfileUrl(id?: string) {
  return id && /^[1-9]\d{0,11}$/.test(id)
    ? `${origin}/fichaequipo/${id}`
    : undefined;
}

export function playerProfileUrl(sourceUrl?: string) {
  return sourceUrl &&
    /^https:\/\/www\.rffm\.es\/fichajugador\/[1-9]\d{0,11}$/.test(sourceUrl)
    ? sourceUrl
    : undefined;
}

export function matchReportUrl(id: string) {
  // The provider uses codacta as the ID; synthetic fallback IDs contain hyphens.
  return /^[1-9]\d{0,11}$/.test(id)
    ? `${origin}/acta-partido/${id}`
    : undefined;
}
