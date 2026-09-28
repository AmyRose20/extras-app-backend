// Uses Google's Places API (New). The key stays here on the server (.env),
// never in the app. It's the same backend key as geocoding.

// Search is biased towards the Wicklow studios and limited to Ireland
const SEARCH_CENTER = { latitude: 52.99, longitude: -6.11 };
const SEARCH_RADIUS_METRES = 50000; // 50 km (the maximum Google allows for a bias)

function getKey(res) {
  const key = process.env.GOOGLE_GEOCODING_API_KEY;
  if (!key) {
    res.status(500).json({ error: 'Place search is not set up on the server' });
    return null;
  }
  return key;
}

// GET /places/autocomplete?input=brittas&sessionToken=abc123
// Returns suggestions as the coordinator types.
async function autocomplete(req, res) {
  try {
    const input = (req.query.input || '').trim();
    const sessionToken = req.query.sessionToken;

    // Don't bother Google (or pay) for 0–1 characters
    if (input.length < 2) {
      return res.json({ suggestions: [] });
    }

    const key = getKey(res);
    if (!key) return;

    const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
      body: JSON.stringify({
        input,
        sessionToken,
        includedRegionCodes: ['ie'],
        locationBias: { circle: { center: SEARCH_CENTER, radius: SEARCH_RADIUS_METRES } },
      }),
    });
    const data = await response.json();

    if (!response.ok) {
      console.error('Places autocomplete error:', data.error?.message);
      return res.status(502).json({ error: 'Could not search for places right now' });
    }

    // Simplify Google's response into just what the app needs
    const suggestions = (data.suggestions || [])
      .filter((s) => s.placePrediction)
      .map((s) => ({
        placeId: s.placePrediction.placeId,
        mainText: s.placePrediction.structuredFormat?.mainText?.text ?? s.placePrediction.text.text,
        secondaryText: s.placePrediction.structuredFormat?.secondaryText?.text ?? '',
      }));

    return res.json({ suggestions });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong searching for places' });
  }
}

// GET /places/details/:placeId?sessionToken=abc123
// Returns the chosen place's name, address and exact location.
async function details(req, res) {
  try {
    const { placeId } = req.params;
    const sessionToken = req.query.sessionToken;

    const key = getKey(res);
    if (!key) return;

    let url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;
    if (sessionToken) url += `?sessionToken=${encodeURIComponent(sessionToken)}`;

    const response = await fetch(url, {
      headers: {
        'X-Goog-Api-Key': key,
        // Only ask for the fields we need (this also keeps the cost down)
        'X-Goog-FieldMask': 'displayName,formattedAddress,location',
      },
    });
    const data = await response.json();

    if (!response.ok || !data.location) {
      console.error('Places details error:', data.error?.message);
      return res.status(502).json({ error: 'Could not get that place right now' });
    }

    return res.json({
      name: data.displayName?.text ?? '',
      address: data.formattedAddress ?? '',
      latitude: data.location.latitude,
      longitude: data.location.longitude,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong getting that place' });
  }
}

module.exports = { autocomplete, details };