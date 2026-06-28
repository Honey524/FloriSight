import crypto from "crypto";

const KEY_LENGTH = 64;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH).toString("hex");

  return `${salt}:${hash}`;
}

export function verifyPassword(password, storedHash) {
  if (!password || !storedHash || !storedHash.includes(":")) {
    return false;
  }

  const [salt, hash] = storedHash.split(":");
  const hashBuffer = Buffer.from(hash, "hex");
  const attemptedBuffer = crypto.scryptSync(password, salt, KEY_LENGTH);

  return (
    hashBuffer.length === attemptedBuffer.length &&
    crypto.timingSafeEqual(hashBuffer, attemptedBuffer)
  );
}
