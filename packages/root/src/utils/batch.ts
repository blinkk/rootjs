export async function batchAsyncCalls<T, U>(
  data: T[],
  batchSize: number,
  asyncFunction: (item: T) => Promise<U>
): Promise<U[]> {
  const result: U[] = [];
  const batches = Math.ceil(data.length / batchSize);
  for (let i = 0; i < batches; i++) {
    const batch = data.slice(i * batchSize, (i + 1) * batchSize);
    const batchResults = await Promise.all(batch.map(asyncFunction));
    result.push(...batchResults);
  }
  return result;
}
