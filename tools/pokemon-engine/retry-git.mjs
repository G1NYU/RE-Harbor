// GitHub can transiently reject anonymous fetches from hosted build runners.
// Retry only source checkout network operations; revision and dirty-tree
// validation in build.mjs must still fail immediately when their pins differ.
export async function retryGit(
  label,
  operation,
  {
    attempts = 4,
    wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    warn = console.warn,
  } = {},
) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === attempts) throw error;
      const delayMs = 5_000 * attempt;
      // Do not print the error itself: Git can include credentials in failure output.
      warn(
        `[pokemon-engine] ${label} failed (${attempt}/${attempts}); retrying in ${delayMs / 1000}s`,
      );
      await wait(delayMs);
    }
  }
}
