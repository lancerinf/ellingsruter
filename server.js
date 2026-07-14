import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ellingsrudåsen stop place ID
const STOP_PLACE_ID = 'NSR:StopPlace:58220';

// Entur Journey Planner GraphQL API (Open Service - no API key needed)
const ENTUR_JOURNEY_PLANNER = 'https://api.entur.io/journey-planner/v3/graphql';

// Required header for all Entur Open APIs
const ENTUR_HEADERS = {
  'Content-Type': 'application/json',
  'ET-Client-Name': 'fede-ellingsruter',
};

// GraphQL query for departures
const DEPARTURE_QUERY = `
  query Departures($stopPlaceId: String!, $numberOfDepartures: Int!) {
    stopPlace(id: $stopPlaceId) {
      name
      quays {
        name
        estimatedCalls(numberOfDepartures: $numberOfDepartures) {
          aimedDepartureTime
          expectedDepartureTime
          realtime
          cancellation
          destinationDisplay {
            frontText
          }
          serviceJourney {
            line {
              publicCode
              name
              presentation {
                colour
                textColour
              }
            }
          }
        }
      }
    }
  }
`;

// Cache with dynamic expiration: expire 30 seconds after earliest departure time
let cachedStopPlace = null;
let cacheTime = 0;

function getCacheExpirationTime(data) {
  const quays = data?.stopPlace?.quays;
  if (!quays) return Date.now() + 30000; // fallback: 30 seconds

  let earliestFuture = Infinity;
  for (const quay of quays) {
    const calls = quay.estimatedCalls || [];
    for (const call of calls) {
      const depTime = new Date(call.aimedDepartureTime).getTime();
      if (depTime > Date.now() && depTime < earliestFuture) {
        earliestFuture = depTime;
      }
    }
  }

  if (earliestFuture === Infinity) return Date.now() + 30000; // no future departures
  return earliestFuture + 30000; // expire 30 seconds after earliest departure
}

async function getDepartures() {
  const now = Date.now();
  const cacheExpires = cachedStopPlace ? getCacheExpirationTime(cachedStopPlace) : 0;
  if (cachedStopPlace && now < cacheExpires) {
    console.log('[cache] Returning cached departures (expires in %d s)', Math.round((cacheExpires - now) / 1000));
    return cachedStopPlace;
  }
  console.log('[api] Fetching fresh departures from Entur API');

  const start = Date.now();
  const res = await fetch(ENTUR_JOURNEY_PLANNER, {
    method: 'POST',
    headers: ENTUR_HEADERS,
    body: JSON.stringify({
      query: DEPARTURE_QUERY,
      variables: { stopPlaceId: STOP_PLACE_ID, numberOfDepartures: 6 },
    }),
  });
  const elapsed = Date.now() - start;

  if (!res.ok) {
    console.error('[api] Entur API error: %d %s (%d ms)', res.status, res.statusText, elapsed);
    return { error: `Entur API error: ${res.status} ${res.statusText}` };
  }
  console.log('[api] Entur API OK: %d %s (%d ms)', res.status, res.statusText, elapsed);

  const data = await res.json();

  if (data.errors) {
    console.error('[api] GraphQL errors: %O', data.errors);
    return { error: `Entur API error: ${data.errors[0]?.message || 'Unknown error'}` };
  }

  cachedStopPlace = data.data;
  cacheTime = now;
  return data.data;
}

app.use(express.json());

app.get('/api/departures', async (req, res) => {
  try {
    const data = await getDepartures();
    if (data.error) {
      return res.status(500).json({ error: data.error });
    }
    res.json(data);
  } catch (err) {
    console.error('[server] Unexpected error: %s', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.NODE_PORT || 3030;
app.listen(PORT, () => {
  console.log('[server] Ellingsruter listening on http://localhost:%d', PORT);
  console.log('[server] Fetching departures from Entur API for stop: %s', STOP_PLACE_ID);
});
