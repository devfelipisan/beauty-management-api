/** Storage guarantees that no object write was attempted for this failure. */
export class ImageWriteNotStartedError extends Error {
  readonly writeStarted = false;
}
