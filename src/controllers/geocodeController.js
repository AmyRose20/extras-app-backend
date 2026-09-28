// GET /geocode/reverse?lat=53.01&lng=-6.08 — ADMIN turns a map pin into an address.
// The Google key lives only here on the server (in .env), never in the app.
async function reverseGeocode(req, res) {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);

    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ error: 'lat and lng must be valid coordinates' });
    }

    const key = process.env.GOOGLE_GEOCODING_API_KEY;
    if (!key) {
      return res.status(500).json({ error: 'Address lookup is not set up on the server' });
    }

    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}`;
    const response = await fetch(url);
    const data = await response.json();

    // Nothing at that spot (e.g. the middle of the sea) — not an error, just no address
    if (data.status === 'ZERO_RESULTS') {
      return res.json({ address: null });
    }

    if (data.status !== 'OK') {
      console.error('Geocoding error:', data.status, data.error_message);
      return res.status(502).json({ error: 'Could not look up an address for that spot' });
    }

    // Prefer a normal address over a Plus Code (e.g. "XVVR+R6 ...") when Google has one
    const best = data.results.find((r) => !r.types.includes('plus_code')) || data.results[0];
    return res.json({ address: best.formatted_address });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong looking up that address' });
  }
}

module.exports = { reverseGeocode };