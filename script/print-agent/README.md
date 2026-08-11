# Kitchen print agent

Pulls kitchen slips off the store's print queue and sends them to thermal
printers on the shop's own network. Runs on any PC at the counter; nothing on
the shop network needs to be reachable from the internet.

## Setup

1. In the app, go to **Settings → Printing → Sales receipt** and, under
   *Kitchen printers*:
   - add each printer with its `host:port` (thermal printers are usually
     `192.168.1.50:9100`) and the station it serves — leave the station empty on
     the printer that should catch everything not assigned elsewhere;
   - create an agent and copy the token. **The token is shown once.**
2. On the counter PC (Node 18+):

```bash
cp agent.config.example.json agent.config.json
```

3. Put the API base URL and the token into `agent.config.json`, then run:

```bash
node script/print-agent/agent.mjs --config agent.config.json
```

Keep it running — as a Windows service (`nssm`), a launchd job on macOS, or a
`systemd` unit on Linux.

## How it behaves

- Polls every few seconds and claims up to `batchSize` jobs at a time. Two agents
  on the same counter never take the same ticket.
- A job that fails goes back to the queue and is retried; after 5 attempts it is
  marked failed and shows up with its error on the printing settings screen,
  where it can be retried by hand.
- A job claimed by an agent that dies is released again after 2 minutes.
- While no printer is configured for a store, the till keeps printing kitchen
  slips through the browser exactly as before. Adding the first active printer is
  what hands the slips over to this queue.

## Thai and Lao text

The renderer sends plain text plus ESC/POS control codes. Thermal printers only
draw Thai or Lao if their firmware has the font. If yours prints boxes, replace
`renderTicket()` with a raster build (render the ticket to a 1-bit bitmap and
send it with `GS v 0`) — the job payload is structured JSON, so nothing else has
to change.
