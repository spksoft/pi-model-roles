export class DeadlineError extends Error {
  constructor() {
    super("deadline");
  }
}
/** Bounds even non-cooperative providers; observes the losing promise to avoid unhandled rejection. */
export async function bounded<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  const interrupted = new Promise<never>((_resolve, reject) => {
    abort = () => {
      controller.abort();
      reject(new Error("cancelled"));
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => {
      controller.abort();
      reject(new DeadlineError());
    }, timeoutMs);
  });
  try {
    if (signal?.aborted) return await interrupted;
    return await Promise.race([Promise.resolve().then(() => work(controller.signal)), interrupted]);
  } finally {
    clearTimeout(timer);
    if (abort) signal?.removeEventListener("abort", abort);
    controller.abort();
  }
}
