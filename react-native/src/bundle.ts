/**
 * The URL of the bundle a stack's first frame runs from. The receiver keeps that bundle's source
 * map at launch, so the app's stacks still read right after a Fast Refresh has moved Metro's bundle on.
 */
export function bundleFrom(stack: string | undefined): string | null {
  return stack?.match(/\((https?:\/\/[^)]+?):\d+:\d+\)/)?.[1] ?? null
}
