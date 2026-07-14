# Ellingsruter

Next departure times from **Ellingsrudåsen** T-bane station, displayed in a real-time web UI.

## Setup

Install dependencies:

```bash
npm install
```

## Run

Start the dev server (with auto-reload on file changes):

```bash
npm run dev
```

The server starts on **http://localhost:3030**.

## Stop

Press `Ctrl+C` in the terminal where the server is running.

## How it works

- The server fetches the next 6 departures from the [Entur Journey Planner API](https://developer.entur.org/) for Ellingsrudåsen station (`NSR:StopPlace:58220`).
- Results are cached until the time of the first departure has passed.
- The frontend auto-refreshes every 30 seconds to keep departure times up to date.
- Only the next 6 departures are shown by the client.

## Run with Podman Quadlet

Build the image locally:

```bash
podman build -t ellingsruter .
```

Reload and start the service:

```bash
systemctl --user daemon-reload
systemctl --user start ellingsruter-podman
```

Restart the service and check status :

```bash
systemctl --user restart ellingsruter-podman
systemctl --user status ellingsruter-podman
```

Stop and disable:

```bash
systemctl --user stop ellingsruter-podman
systemctl --user disable ellingsruter-podman
```

The app will be available at **http://localhost:3030**.

## Configuration

No API key is required for the Entur Open API. The client name is set to `fede-ellingsruter` in the request headers.

To change the monitored station, update `STOP_PLACE_ID` in `server.js`.
