const ALLOWED_USERS = new Set([
  "883495629970636860",  // yanshroom
  "1424947766060126313", // luckyQuqi
]);

export function isAllowed(userId: string): boolean {
  return ALLOWED_USERS.has(userId);
}
