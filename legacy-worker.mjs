// Preserve the original origin so browser-only records remain accessible.
const legacyWorker = {
  fetch(request, env) {
    return env.CENTBLOOM.fetch(request);
  },
};

export default legacyWorker;
