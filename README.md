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

The server starts on **http://localhost:3000**.

## Stop

Press `Ctrl+C` in the terminal where the server is running.

## How it works

- The server fetches departure data from the [Entur Journey Planner API](https://developer.entur.org/) for Ellingsrudåsen station (`NSR:StopPlace:58220`).
- Results are cached for 1 hour to avoid excessive API calls.
- The frontend auto-refreshes every 30 seconds to keep departure times up to date.
- Only departures within the next 4 hours are shown.

## Run with Podman Quadlet

First, build the image locally:

```bash
podman build -t ellingsruter .
```

Then copy the `.container` file to your Quadlet directory:

```bash
cp ellingsruter.container ~/.config/containers/systemd/
```

Reload and start the service:

```bash
systemctl --user daemon-reload
systemctl --user start ellingsruter.container
```

Check status:

```bash
systemctl --user status ellingsruter.container
```

Stop and disable:

```bash
systemctl --user stop ellingsruter.container
systemctl --user disable ellingsruter.container
```

The app will be available at **http://localhost:3000**.

## Configuration

No API key is required for the Entur Open API. The client name is set to `fede-ellingsruter` in the request headers.

To change the monitored station, update `STOP_PLACE_ID` in `server.js`.
