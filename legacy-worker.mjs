// The previous public service is retired; keep this Worker inaccessible.
const retiredWorker = {
  fetch() {
    return new Response("This service address is closed.", {
      status: 410,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  },
};
export default retiredWorker;
