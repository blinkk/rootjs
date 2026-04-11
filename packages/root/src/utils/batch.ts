export async function batchAsyncCalls<T, U>(
  data: T[],
  concurrency: number,
  asyncFunction: (item: T) => Promise<U>
): Promise<U[]> {
  const result: U[] = new Array(data.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < data.length) {
      const index = nextIndex++;
      result[index] = await asyncFunction(data[index]);
    }
  }

  const workers = Array.from(
    {length: Math.min(concurrency, data.length)},
    () => worker()
  );
  await Promise.all(workers);
  return result;
}
