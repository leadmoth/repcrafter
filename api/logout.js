// Clears the session cookie and signs the user out.
// POST /api/logout

const { setCookie } = require('./_lib/cookies');

function isHttps(req) {
  const xf = req.headers['x-forwarded-proto'];
  return xf ? String(xf).split(',')[0].trim() === 'https' : !!(req.connection && req.connection.encrypted);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  // Delete the session cookie
  setCookie(res, 'session', '', {
    Path: '/',
    HttpOnly: true,
    Secure: isHttps(req),
    SameSite: 'Lax',
    MaxAge: 0,
  });

  res.status(200).json({ ok: true });
};
