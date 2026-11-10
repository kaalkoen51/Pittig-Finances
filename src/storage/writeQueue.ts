/** Serialises async writes; `flush()` resolves once everything queued so far is done. */
export class WriteQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.tail.then(task, task);
    this.tail = next.catch(() => undefined);
    return next;
  }

  flush(): Promise<void> {
    return this.tail.then(() => undefined);
  }
}
