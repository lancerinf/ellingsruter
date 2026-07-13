const departuresEl = document.getElementById('departures');
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const refreshInfoEl = document.getElementById('refresh-info');

let refreshInterval = null;

function getLineClass(lineCode) {
  const code = lineCode || '';
  // T-bane: digits only (1-4 digits), or digit + N suffix (e.g. 2N)
  if (/^[0-9]+$/.test(code)) return 't-bane';
  if (/^[0-9]+N$/.test(code)) return 't-bane';
  if (/^[0-9]+$/.test(code)) return 'bus';
  // Tram: single letter
  if (/^[A-Z]$/.test(code)) return 'tram';
  // Ferry: letter + digits (e.g. F1, K1)
  if (/^[A-Z][0-9]+$/.test(code)) return 'ferry';
  return 'default';
}

function formatTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
}

function getRelativeText(timeStr) {
  const now = new Date();
  const departure = new Date(timeStr);
  const diffMin = Math.round((departure - now) / 60000);

  if (diffMin <= 0) return 'Avgått';
  if (diffMin === 1) return 'Om 1 min';
  if (diffMin <= 5) return `Om ${diffMin} min`;
  if (diffMin <= 59) return `Om ${diffMin} min`;
  const hours = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  if (mins === 0) return `Om ${hours} time${hours > 1 ? 'r' : ''}`;
  return `Om ${hours}t ${mins}m`;
}

function getLineColors(presentation) {
  if (!presentation) return { bg: '#64748b', color: '#ffffff' };

  // Get color from presentation (GraphQL API returns colour with British spelling)
  let colour = presentation.colour || presentation.color;
  if (colour) {
    // Ensure colour starts with #
    const bg = colour.startsWith('#') ? colour : `#${colour}`;
    return { bg, color: presentation.textColour || '#ffffff' };
  }

  return { bg: '#64748b', color: '#ffffff' };
}

function renderDepartures(data) {
  const quays = data?.stopPlace?.quays;
  if (!quays || quays.length === 0) {
    errorEl.textContent = 'Ingen avganger funnet';
    errorEl.style.display = 'block';
    departuresEl.innerHTML = '';
    return;
  }

  const now = new Date();

  // Collect all departures from all quays
  let allDepartures = [];
  for (const quay of quays) {
    const calls = quay.estimatedCalls || [];
    for (const call of calls) {
      if (call.aimedDepartureTime) {
        const depTime = new Date(call.aimedDepartureTime);
        // Only show departures within the next 4 hours
        if (depTime >= now && depTime <= new Date(now.getTime() + 4 * 60 * 60 * 1000)) {
          allDepartures.push(call);
        }
      }
    }
  }

  // Sort by departure time
  allDepartures.sort((a, b) =>
    new Date(a.aimedDepartureTime) - new Date(b.aimedDepartureTime)
  );

  if (allDepartures.length === 0) {
    errorEl.textContent = 'Ingen avganger funnet';
    errorEl.style.display = 'block';
    departuresEl.innerHTML = '';
    return;
  }

  errorEl.style.display = 'none';

  departuresEl.innerHTML = allDepartures.map((dep, i) => {
    const lineCode = dep.serviceJourney?.line?.publicCode || '?';
    const linePresentation = dep.serviceJourney?.line?.presentation || {};
    const destination = dep.destinationDisplay?.frontText || 'Ukjent';
    const via = dep.via?.name || '';
    const time = formatTime(dep.aimedDepartureTime);
    const relative = getRelativeText(dep.aimedDepartureTime);
    const isImminent = (() => {
      const diff = Math.round((new Date(dep.aimedDepartureTime) - new Date()) / 60000);
      return diff <= 2;
    })();
    const { bg, color } = getLineColors(linePresentation);
    const bgColor = bg || '#64748b';
    const textColor = color || '#ffffff';

    return `
      <div class="departure-card ${isImminent ? 'imminent' : ''}">
        <div class="line-badge" style="background: ${bgColor}; color: ${textColor};">${lineCode}</div>
        <div class="departure-info">
          <div class="departure-destination">${destination}</div>
          ${via ? `<div class="departure-via">via ${via}</div>` : ''}
        </div>
        <div class="departure-time">
          <div class="time ${isImminent ? 'imminent' : ''}">${time}</div>
          <div class="relative ${isImminent ? 'imminent' : ''}">${relative}</div>
        </div>
      </div>
    `;
  }).join('');

  refreshInfoEl.textContent = `Sist oppdatert: ${new Date().toLocaleTimeString('nb-NO')}`;
}

async function fetchDepartures() {
  loadingEl.style.display = 'block';
  departuresEl.style.display = 'none';
  errorEl.style.display = 'none';

  try {
    const res = await fetch('/api/departures');
    const data = await res.json();

    if (data.error) {
      if (data.needsKey) {
        errorEl.innerHTML = `
          <strong>API-nøkkel kreves</strong><br><br>
          Entur API krever nå en gratis API-nøkkel.<br><br>
          1. Gå til <a href="https://developer.entur.org/" target="_blank" style="color: #f59e0b;">developer.entur.org</a><br>
          2. Opprett en konto<br>
          3. Generer en API-nøkkel<br>
          4. Start serveren med:<br>
          <code style="display:block;background:#1e293b;padding:0.5rem;border-radius:6px;margin-top:0.5rem;">ENTUR_API_KEY=din_nøkkel npm run dev</code>
        `;
      } else {
        errorEl.textContent = data.error;
      }
      errorEl.style.display = 'block';
      return;
    }

    renderDepartures(data);
    loadingEl.style.display = 'none';
    departuresEl.style.display = 'flex';
  } catch (err) {
    errorEl.textContent = 'Kunne ikke hente avganger. Prøv igjen om et øyeblikk.';
    errorEl.style.display = 'block';
  }
}

// Initial load
fetchDepartures();

// Auto-refresh every 30 seconds
refreshInterval = setInterval(fetchDepartures, 30000);
