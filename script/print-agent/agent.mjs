#!/usr/bin/env node
// O KhaiDee+ kitchen print agent.
//
// Runs on a PC at the shop. Polls the store's print queue, renders each ticket
// and pushes it to the thermal printer over TCP (ESC/POS, port 9100 by default).
// It only ever pulls work: nothing on the shop network has to be reachable from
// the internet, and the token it carries can do nothing but claim and
// acknowledge print jobs for its own store.
//
//   node agent.mjs --config agent.config.json
//
// Config (see agent.config.example.json):
//   { "apiBaseUrl": "https://api.example.com/api", "token": "pa_...", "pollSeconds": 3 }

import { readFileSync } from "node:fs";
import { connect } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";

const ESC = "\x1B";
const GS = "\x1D";
// Thai and Lao are not in any ESC/POS code page, so text is sent as-is only for
// ASCII; anything else is rendered by the printer's own font when it has one and
// otherwise needs a raster-image build. Keeping the payload as plain text keeps
// this agent readable — swap renderTicket() for a bitmap renderer if your
// printer cannot draw the script.
const INIT = `${ESC}@`;
const ALIGN_CENTER = `${ESC}a1`;
const ALIGN_LEFT = `${ESC}a0`;
const BOLD_ON = `${ESC}E1`;
const BOLD_OFF = `${ESC}E0`;
const DOUBLE_ON = `${GS}!\x11`;
const DOUBLE_OFF = `${GS}!\x00`;
const CUT = `${GS}V\x42\x00`;

function readConfig() {
	const index = process.argv.indexOf("--config");
	const path = index >= 0 ? process.argv[index + 1] : "agent.config.json";
	const config = JSON.parse(readFileSync(path, "utf8"));
	if (!config.apiBaseUrl || !config.token) throw new Error("apiBaseUrl and token are required in the config file");
	return {
		apiBaseUrl: String(config.apiBaseUrl).replace(/\/$/, ""),
		token: String(config.token),
		pollSeconds: Math.max(1, Number(config.pollSeconds) || 3),
		batchSize: Math.max(1, Math.min(20, Number(config.batchSize) || 5)),
	};
}

function line(width) { return "-".repeat(width === 58 ? 32 : 42); }

function renderTicket(job) {
	const width = Number(job.paper_width) === 58 ? 58 : 80;
	const ticket = job.payload || {};
	const parts = [ INIT, ALIGN_CENTER ];
	if (ticket.store_name) parts.push(`${BOLD_ON}${ticket.store_name}${BOLD_OFF}\n`);
	parts.push(`${DOUBLE_ON}${ticket.kind === "void" ? "*** CANCEL ***" : ticket.station || "KITCHEN"}${DOUBLE_OFF}\n`);
	if (ticket.label) parts.push(`${BOLD_ON}${ticket.label}${BOLD_OFF}\n`);
	const meta = [ ticket.order_no, ticket.round ? `Round ${ticket.round}` : "" ].filter(Boolean).join(" · ");
	if (meta) parts.push(`${meta}\n`);
	parts.push(`${new Date(ticket.printed_at || Date.now()).toLocaleString()}\n`);
	parts.push(`${ALIGN_LEFT}${line(width)}\n`);
	for (const item of ticket.items || []) {
		parts.push(`${DOUBLE_ON}${item.qty} x ${item.name}${DOUBLE_OFF}\n`);
		if (item.is_gift) parts.push("   (gift)\n");
		if (item.note) parts.push(`   * ${item.note}\n`);
	}
	parts.push(`${line(width)}\n`);
	if (ticket.reason) parts.push(`Reason: ${ticket.reason}\n`);
	parts.push("\n\n\n", CUT);
	return Buffer.from(parts.join(""), "binary");
}

function sendToPrinter(address, data) {
	const [ host, port ] = String(address).split(":");
	return new Promise((resolve, reject) => {
		const socket = connect({ host, port: Number(port) || 9100 });
		// A printer that is off answers nothing at all, so the attempt has to time
		// out rather than hold the queue open until someone notices.
		socket.setTimeout(8000);
		socket.on("connect", () => socket.end(data));
		socket.on("timeout", () => { socket.destroy(); reject(new Error(`printer ${address} timed out`)); });
		socket.on("error", (error) => reject(error));
		socket.on("close", (hadError) => { if (!hadError) resolve(); });
	});
}

async function api(config, path, body) {
	const response = await fetch(`${config.apiBaseUrl}${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json", "X-Print-Token": config.token },
		body: JSON.stringify(body || {}),
	});
	if (!response.ok) throw new Error(`${path} responded ${response.status}`);
	const parsed = await response.json().catch(() => ({}));
	return parsed?.data;
}

async function tick(config) {
	const jobs = await api(config, "/print/agent/jobs/claim", { limit: config.batchSize });
	if (!Array.isArray(jobs) || !jobs.length) return 0;
	for (const job of jobs) {
		try {
			await sendToPrinter(job.address, renderTicket(job));
			await api(config, `/print/agent/jobs/${job.id}/complete`, { ok: true });
			console.log(`[print-agent] ${job.kind} -> ${job.printer_name}`);
		} catch (error) {
			// Reported rather than swallowed: the server puts it back in the queue
			// and the shop sees the reason on the printing settings screen.
			await api(config, `/print/agent/jobs/${job.id}/complete`, { ok: false, error: String(error?.message || error) })
				.catch((reportError) => console.error("[print-agent] could not report failure", reportError));
			console.error(`[print-agent] ${job.printer_name}: ${error?.message || error}`);
		}
	}
	return jobs.length;
}

async function main() {
	const config = readConfig();
	console.log(`[print-agent] polling ${config.apiBaseUrl} every ${config.pollSeconds}s`);
	let failures = 0;
	for (;;) {
		try {
			await tick(config);
			failures = 0;
		} catch (error) {
			failures += 1;
			console.error(`[print-agent] poll failed (${failures}): ${error?.message || error}`);
		}
		// Backs off when the server is unreachable so a shop with a dropped line
		// does not hammer it, but never stops trying.
		await sleep(config.pollSeconds * 1000 * Math.min(10, failures || 1));
	}
}

main().catch((error) => {
	console.error(`[print-agent] fatal: ${error?.message || error}`);
	process.exit(1);
});
