import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

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

// Cache with dynamic expiration: expire 30 seconds after the first departure in the set passes
let cachedStopPlace = null;
let cacheTime = 0;

function getCacheExpirationTime(data) {
  const quays = data?.stopPlace?.quays;
  if (!quays) return Date.now() + 30000; // fallback: 30 seconds

  let firstDeparture = Infinity;
  for (const quay of quays) {
    const calls = quay.estimatedCalls || [];
    for (const call of calls) {
      const depTime = new Date(call.aimedDepartureTime).getTime();
      if (depTime < firstDeparture) {
        firstDeparture = depTime;
      }
    }
  }

  if (firstDeparture === Infinity) return Date.now() + 30000;
  // Expire 30 seconds after the first departure passes
  return firstDeparture + 30000;
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
      variables: { stopPlaceId: STOP_PLACE_ID, numberOfDepartures: 7 },
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

// Pre-rendered HTML template for Kindle (no JavaScript)
const kindleTemplatePath = path.join(__dirname, 'public', 'kindle.html');
let kindleTemplate = '';
try {
  kindleTemplate = readFileSync(kindleTemplatePath, 'utf-8');
} catch (e) {
  console.warn('[server] Could not read kindle.html template:', e.message);
}

app.get('/kindle', async (req, res) => {
  try {
    const data = await getDepartures();
    if (data.error) {
      const html = kindleTemplate
        .replace('<!--DEPARTURES-->', `<div class="error">${data.error}</div>`)
        .replace('<!--REFRESH_INFO-->', `Feil: ${data.error}`);
      return res.status(500).type('text/html').send(html);
    }

    const now = new Date();
    const quays = data?.stopPlace?.quays;
    if (!quays || quays.length === 0) {
      const html = kindleTemplate
        .replace('<!--DEPARTURES-->', '<div class="error">Ingen avganger funnet</div>')
        .replace('<!--REFRESH_INFO-->', 'Ingen avganger funnet');
      return res.type('text/html').send(html);
    }

    // Collect all departures that haven't passed yet
    let allDepartures = [];
    for (const quay of quays) {
      const calls = quay.estimatedCalls || [];
      for (const call of calls) {
        if (call.aimedDepartureTime) {
          const depTime = new Date(call.aimedDepartureTime);
          if (depTime >= now) {
            allDepartures.push(call);
          }
        }
      }
    }

    // Sort by departure time and take the next 6
    allDepartures.sort((a, b) =>
      new Date(a.aimedDepartureTime) - new Date(b.aimedDepartureTime)
    );
    allDepartures = allDepartures.slice(0, 5);

    if (allDepartures.length === 0) {
      const html = kindleTemplate
        .replace('<!--DEPARTURES-->', '<div class="error">Ingen avganger funnet</div>')
        .replace('<!--REFRESH_INFO-->', 'Ingen avganger funnet');
      return res.type('text/html').send(html);
    }

    const html = kindleTemplate
      .replace('<!--DEPARTURES-->', allDepartures.map((dep) => {
        const lineCode = dep.serviceJourney?.line?.publicCode || '?';
        const destination = dep.destinationDisplay?.frontText || 'Ukjent';
        const time = new Date(dep.aimedDepartureTime).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
        const diffMin = Math.round((new Date(dep.aimedDepartureTime) - new Date()) / 60000);
        const relative = diffMin <= 0 ? 'Avgått' : `${diffMin} min`;
        return `<div class="departure-card">
          <div class="departure-row">
            <div class="line-badge">${lineCode}</div>
            <div class="departure-info">
              <div class="departure-destination">${destination}</div>
            </div>
            <div class="departure-time">
              <span class="departure-time-inner">
                <span class="relative">${relative}</span>
                <span class="separator">·</span>
                <span class="time">${time}</span>
              </span>
            </div>
          </div>
        </div>`;
      }).join('\n      '))
      .replace('<!--REFRESH_INFO-->', `Sist oppdatert: ${now.toLocaleTimeString('nb-NO')}`);

    res.type('text/html').send(html);
  } catch (err) {
    console.error('[server] Unexpected error in /kindle: %s', err.message);
    const html = kindleTemplate
      .replace('<!--DEPARTURES-->', `<div class="error">Kunne ikke hente avganger</div>`)
      .replace('<!--REFRESH_INFO-->', 'Feil ved lasting');
    res.status(500).type('text/html').send(html);
  }
});

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.NODE_PORT || 3030;
app.listen(PORT, () => {
  console.log('[server] Ellingsruter listening on http://localhost:%d', PORT);
  console.log('[server] Fetching departures from Entur API for stop: %s', STOP_PLACE_ID);
});
