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

// Cache stop place data for 1 hour
let cachedStopPlace = null;
let cacheTime = 0;

async function getDepartures() {
  const now = Date.now();
  if (cachedStopPlace && now - cacheTime < 3600000) {
    return cachedStopPlace;
  }

  const res = await fetch(ENTUR_JOURNEY_PLANNER, {
    method: 'POST',
    headers: ENTUR_HEADERS,
    body: JSON.stringify({
      query: DEPARTURE_QUERY,
      variables: { stopPlaceId: STOP_PLACE_ID, numberOfDepartures: 5 },
    }),
  });

  if (!res.ok) {
    console.error(`Journey Planner API error: ${res.status} ${res.statusText}`);
    return { error: `Entur API error: ${res.status} ${res.statusText}` };
  }

  const data = await res.json();

  if (data.errors) {
    console.error('GraphQL errors:', data.errors);
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
    console.error('Server error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Ellingsruter listening on http://localhost:${PORT}`);
});
