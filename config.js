// Public config read by the client
// TEMP: you can set BYPASS_AUTH: true to get the site working immediately
// while we finish fixing Google/Stripe auth.
window.REPCRAFTER_CONFIG = {
  GOOGLE_CLIENT_ID: "771660574075-ee6kgrsk1m0oum5tiqklpkqtv0fevvse.apps.googleusercontent.com", // ensure this matches your server env
  WEBHOOK_URL: "/api/chat",
  DEBUG: false,
  REQUIRE_AUTH: true,  // set to false on preview if you want to bypass in previews
  BYPASS_AUTH: false   // set to true temporarily to bypass gating on the client
};
