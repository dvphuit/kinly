let lockCount = 0;
let overflowBeforeLock = '';

export function acquireBodyScrollLock(): () => void {
  if (lockCount === 0) {
    overflowBeforeLock = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }

  lockCount += 1;
  let released = false;

  return () => {
    if (released) return;
    released = true;
    lockCount -= 1;

    if (lockCount === 0) {
      document.body.style.overflow = overflowBeforeLock;
      overflowBeforeLock = '';
    }
  };
}
