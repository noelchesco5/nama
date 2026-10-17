export default {
  async fetch(request, env, ctx) {
    let url = new URL(request.url);
    let response = await env.ASSETS.fetch(request);
    // SPA fallback to index.html for client-side routing
    if (response.status === 404 && !url.pathname.includes('.')) {
      return env.ASSETS.fetch(new Request(`${url.origin}/index.html`, request));
    }
    return response;
  },
};
