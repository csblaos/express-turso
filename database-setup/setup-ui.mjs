import http from "node:http";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { checkDatabaseConnection, databaseLabel, runDatabaseSetup } from "./setup.mjs";

const host = process.env.SETUP_UI_HOST || "127.0.0.1";
const port = Number(process.env.SETUP_UI_PORT || 4178);
const directory = path.dirname(fileURLToPath(import.meta.url));
const laoFontPath = path.join(directory, "public/fonts/GoogleSans-Lao-Variable.ttf");
let busy = false;

function sendJson(response, status, payload) {
	response.writeHead(status, {
		"Content-Type": "application/json; charset=utf-8",
		"Cache-Control": "no-store",
	});
	response.end(JSON.stringify(payload));
}

async function readJson(request) {
	const chunks = [];
	let size = 0;
	for await (const chunk of request) {
		size += chunk.length;
		if (size > 64 * 1024) throw new Error("Request is too large");
		chunks.push(chunk);
	}
	return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const page = String.raw`<!doctype html>
<html lang="lo">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex">
  <title>O KhaiDee+ Database Setup</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>tailwind.config={theme:{extend:{colors:{brand:{50:"#effdf4",500:"#18b95b",600:"#0d9a49",900:"#114c2a"}}}}}</script>
  <style>@font-face{font-family:"Google Sans Lao Local";src:url("/fonts/GoogleSans-Lao-Variable.ttf") format("truetype");font-weight:100 900;font-style:normal;font-display:swap}html,body,button,input,select,textarea{font-family:"Google Sans Lao Local",system-ui,sans-serif!important;font-synthesis:none}</style>
</head>
<body class="min-h-screen bg-stone-50 text-stone-800">
  <main class="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-10">
    <header class="mb-6 flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div><p class="text-sm font-semibold text-brand-600">O KhaiDee+ · ເຄື່ອງມືໃນເຄື່ອງ</p><h1 class="mt-1 text-2xl font-bold tracking-tight">ຕັ້ງຄ່າຖານຂໍ້ມູນ</h1><p class="mt-1 text-sm text-stone-500">ເຊື່ອມຕໍ່ໄດ້ສະເພາະຈາກເຄື່ອງນີ້ — credential ຈະບໍ່ຖືກບັນທຶກລົງໄຟລ໌</p></div>
      <div class="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900"><b>ລະວັງ:</b> Reset ຈະລຶບຂໍ້ມູນທັງໝົດຢ່າງຖາວອນ</div>
    </header>

    <div class="grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
      <section class="space-y-6">
        <section class="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          <div class="mb-5 flex items-center justify-between"><div><h2 class="font-bold">1. ການເຊື່ອມຕໍ່ຖານຂໍ້ມູນ</h2><p class="mt-1 text-sm text-stone-500">ຮອງຮັບ Turso/libSQL ຫຼື SQLite ໃນເຄື່ອງ</p></div><span id="connectionBadge" class="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600">ຍັງບໍ່ໄດ້ກວດສອບ</span></div>
          <div class="grid gap-4 sm:grid-cols-3"><label class="block sm:col-span-3"><span class="text-sm font-medium">ປະເພດຖານຂໍ້ມູນ</span><select id="databaseKind" class="mt-1 w-full rounded-xl border-stone-300"><option value="turso">Turso / libSQL (ອອນລາຍ)</option><option value="sqlite">SQLite (ໄຟລ໌ໃນເຄື່ອງ)</option></select></label>
          <label class="block sm:col-span-2"><span class="text-sm font-medium">Database URL</span><input id="databaseUrl" autocomplete="off" placeholder="libsql://your-database-org.turso.io" class="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 outline-none ring-brand-200 focus:ring"></label>
          <label id="tokenGroup" class="block"><span class="text-sm font-medium">Auth token</span><input id="authToken" type="password" autocomplete="off" placeholder="Turso token" class="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 outline-none ring-brand-200 focus:ring"></label></div>
          <button id="checkButton" class="mt-5 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-700">ກວດສອບການເຊື່ອມຕໍ່</button>
        </section>

        <section class="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          <div class="mb-5"><h2 class="font-bold">2. ບັນຊີຜູ້ດູແລ</h2><p class="mt-1 text-sm text-stone-500">ໃຊ້ Username ເພື່ອເຂົ້າໃຊ້ໄດ້ທຸກບັນຊີ</p></div>
          <div class="mb-5 flex gap-2 border-b border-stone-200"><button data-tab="system" class="tab border-b-2 border-brand-500 px-3 pb-3 text-sm font-semibold text-brand-600">System Admin</button><button data-tab="super" class="tab border-b-2 border-transparent px-3 pb-3 text-sm font-semibold text-stone-500">Super Admin</button></div>
          <div id="system" class="account-panel grid gap-4 sm:grid-cols-2"></div><div id="super" class="account-panel hidden grid gap-4 sm:grid-cols-2"></div>
        </section>
      </section>

      <aside class="space-y-6">
        <section class="rounded-2xl border border-brand-100 bg-brand-50 p-5">
          <h2 class="font-bold text-brand-900">ເລືອກການດຳເນີນງານ</h2><p class="mt-1 text-sm text-brand-900/70">ເລືອກໃຫ້ກົງກັບສະຖານະຖານຂໍ້ມູນ</p>
          <div class="mt-4 space-y-3"><label class="flex cursor-pointer gap-3 rounded-xl border border-brand-200 bg-white p-4"><input name="action" type="radio" value="init" checked class="mt-1"><span><b class="block text-sm">ຕັ້ງຄ່າຖານໃໝ່ / Deploy ໃໝ່</b><span class="mt-1 block text-xs text-stone-500">ສ້າງ schema ແລະ ບັນຊີທີ່ຍັງບໍ່ມີ ໂດຍບໍ່ລຶບຂໍ້ມູນເກົ່າ</span></span></label>
          <label class="flex cursor-pointer gap-3 rounded-xl border border-emerald-200 bg-white p-4"><input name="action" type="radio" value="migrate" class="mt-1"><span><b class="block text-sm text-emerald-700">ອັບເດດ Database ເກົ່າ</b><span class="mt-1 block text-xs text-stone-500">ເພີ່ມ schema ລ່າສຸດ ໂດຍບໍ່ລຶບຂໍ້ມູນ ແລະ ບໍ່ສ້າງບັນຊີ</span></span></label>
          <label class="flex cursor-pointer gap-3 rounded-xl border border-red-200 bg-white p-4"><input name="action" type="radio" value="reset" class="mt-1"><span><b class="block text-sm text-red-700">Reset ເປັນ Starter Database</b><span class="mt-1 block text-xs text-stone-500">ລຶບຂໍ້ມູນທັງໝົດ ແລ້ວສ້າງ schema ແລະ ບັນຊີໃໝ່</span></span></label></div>
          <div id="confirmWrap" class="mt-4 hidden"><label class="block text-sm font-medium text-red-800">ພິມ <span id="confirmText" class="font-bold"></span> ເພື່ອຢືນຢັນ</label><input id="resetConfirm" class="mt-1 w-full rounded-xl border border-red-300 px-3 py-2.5" autocomplete="off"></div>
          <button id="runButton" class="mt-5 w-full rounded-xl bg-brand-600 px-4 py-3 font-semibold text-white shadow-sm hover:bg-brand-500">ເລີ່ມຕັ້ງຄ່າຖານຂໍ້ມູນ</button>
        </section>
        <section class="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"><div class="flex items-center justify-between"><h2 class="font-bold">ຜົນການດຳເນີນງານ</h2><button id="copyResult" class="text-sm font-medium text-brand-600">ຄັດລອກ</button></div><pre id="result" class="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-stone-950 p-4 text-xs leading-5 text-emerald-300">ກອກຂໍ້ມູນ ແລ້ວກົດ “ກວດສອບການເຊື່ອມຕໍ່”</pre></section>
      </aside>
    </div>
  </main>
<script>
const $=id=>document.getElementById(id), result=$("result");
const account=(key,title)=>"<div class=\"sm:col-span-2\"><p class=\"text-sm font-semibold\">"+title+"</p></div><label><span class=\"text-sm\">ຊື່ສະແດງ</span><input id=\""+key+"Name\" class=\"mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5\" value=\""+(key==="system"?"Platform Operator":"Store Owner")+"\"></label><label><span class=\"text-sm\">Username</span><input id=\""+key+"Username\" autocomplete=\"username\" class=\"mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5\" value=\""+(key==="system"?"ops":"owner")+"\"></label><label><span class=\"text-sm\">ອີເມວ</span><input id=\""+key+"Email\" type=\"email\" class=\"mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5\" placeholder=\"name@example.com\"></label><label><span class=\"text-sm\">ລະຫັດຜ່ານ (ຢ່າງໜ້ອຍ 6 ຕົວ)</span><div class=\"mt-1 flex gap-2\"><input id=\""+key+"Password\" type=\"password\" autocomplete=\"new-password\" minlength=\"6\" class=\"min-w-0 flex-1 rounded-xl border border-stone-300 px-3 py-2.5\"><button data-copy=\""+key+"Password\" class=\"rounded-xl border border-stone-300 px-3 text-xs\">ຄັດລອກ</button></div></label><label class=\"sm:col-span-2\"><span class=\"text-sm\">ພາສາ UI</span><select id=\""+key+"Locale\" class=\"mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5\"><option value=\"lo\">ລາວ</option><option value=\"th\">ໄທ</option><option value=\"en\">ອັງກິດ</option></select></label>";
$("system").innerHTML=account("system","ຜູ້ດູແລແພລັດຟອມ · ເຂົ້າ /system-admin");
$("super").innerHTML=account("super","ເຈົ້າຂອງທຸລະກິດ · ສ້າງ ແລະ ຈັດການຮ້ານ");
function config(){const a=k=>({name:$(k+"Name").value,username:$(k+"Username").value,email:$(k+"Email").value,password:$(k+"Password").value,locale:$(k+"Locale").value});return{database:{url:$("databaseUrl").value,authToken:$("authToken").value},systemAdmin:a("system"),superadmin:a("super")}}
function out(lines){result.textContent=Array.isArray(lines)?lines.join("\n"):lines}
async function call(path,body){const r=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new Error(data.error||"Request failed");return data}
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.className="tab border-b-2 border-transparent px-3 pb-3 text-sm font-semibold text-stone-500");b.className="tab border-b-2 border-brand-500 px-3 pb-3 text-sm font-semibold text-brand-600";document.querySelectorAll(".account-panel").forEach(x=>x.classList.add("hidden"));$(b.dataset.tab).classList.remove("hidden")});
document.querySelectorAll("[data-copy]").forEach(b=>b.onclick=()=>navigator.clipboard.writeText($(b.dataset.copy).value));
$("copyResult").onclick=()=>navigator.clipboard.writeText(result.textContent);
$("databaseKind").onchange=()=>{const local=$("databaseKind").value==="sqlite";$("databaseUrl").placeholder=local?"file:./okhaidee.db":"libsql://your-database-org.turso.io";$("tokenGroup").classList.toggle("hidden",local)};
document.querySelectorAll("[name=action]").forEach(x=>x.onchange=()=>{const reset=document.querySelector("[name=action]:checked").value==="reset";$("confirmWrap").classList.toggle("hidden",!reset);$("runButton").textContent=reset?"Reset ຂໍ້ມູນທັງໝົດ":"ເລີ່ມຕັ້ງຄ່າຖານຂໍ້ມູນ";$("confirmText").textContent="RESET "+($("databaseUrl").value||"DATABASE_URL")});
$("databaseUrl").oninput=()=>{$("confirmText").textContent="RESET "+($("databaseUrl").value||"DATABASE_URL")};
$("checkButton").onclick=async()=>{try{out("ກຳລັງກວດສອບ...");const d=await call("/api/connect",{database:{url:$("databaseUrl").value,authToken:$("authToken").value}});out(["ເຊື່ອມຕໍ່ສຳເລັດ",JSON.stringify(d.connection,null,2)]);$("connectionBadge").textContent="ເຊື່ອມຕໍ່ແລ້ວ";$("connectionBadge").className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700"}catch(e){out("ບໍ່ສຳເລັດ: "+e.message)}};
$("runButton").onclick=async()=>{const action=document.querySelector("[name=action]:checked").value;const c=config();if(action==="reset"&&$("resetConfirm").value!==("RESET "+c.database.url)){out("ຍົກເລີກ: ຂໍ້ຄວາມຢືນຢັນບໍ່ຖືກຕ້ອງ");return}try{$("runButton").disabled=true;out("ກຳລັງດຳເນີນງານ...");const d=await call("/api/"+action,{config:c,confirmation:$("resetConfirm").value});out(["ສຳເລັດ",...d.logs])}catch(e){out("ບໍ່ສຳເລັດ: "+e.message)}finally{$("runButton").disabled=false}};
</script></body></html>`;

const server = http.createServer(async (request, response) => {
	if (request.method === "GET" && request.url === "/fonts/GoogleSans-Lao-Variable.ttf") {
		response.writeHead(200, {
			"Content-Type": "font/ttf",
			"Cache-Control": "public, max-age=31536000, immutable",
		});
		createReadStream(laoFontPath).pipe(response);
		return;
	}
	if (request.method === "GET" && request.url === "/") {
		response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'self'; script-src 'self' https://cdn.tailwindcss.com 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self';" });
		response.end(page);
		return;
	}
	if (request.method !== "POST" || !request.url?.startsWith("/api/")) {
		sendJson(response, 404, { error: "Not found" });
		return;
	}
	if (busy) {
		sendJson(response, 409, { error: "ກຳລັງມີການດຳເນີນງານກັບຖານຂໍ້ມູນຢູ່" });
		return;
	}
	try {
		const body = await readJson(request);
		const action = request.url.slice("/api/".length);
		if (!["connect", "check", "init", "migrate", "reset"].includes(action)) throw new Error("Unknown action");
		if (action === "connect") {
			const connection = await checkDatabaseConnection(body.database);
			sendJson(response, 200, { ok: true, connection, requestId: randomUUID() });
			return;
		}
		if (action === "reset" && body.confirmation !== `RESET ${String(body.config?.database?.url || "").trim()}`) {
			throw new Error("ຂໍ້ຄວາມຢືນຢັນການ reset ບໍ່ຖືກຕ້ອງ");
		}
		busy = action !== "check";
		const logs = [];
		const summary = await runDatabaseSetup(body.config, action, (message) => logs.push(message));
		sendJson(response, 200, { ok: true, logs, summary, requestId: randomUUID() });
	} catch (error) {
		sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
	} finally {
		busy = false;
	}
});

server.listen(port, host, () => {
	console.log(`Database Setup UI: http://${host}:${port}`);
	console.log("This service listens on localhost only and never writes credentials to disk.");
});

server.on("error", (error) => {
	if (error && error.code === "EADDRINUSE") {
		console.error(`Port ${port} is already in use. Run again with SETUP_UI_PORT=4179 npm run ui`);
		process.exitCode = 1;
		return;
	}
	throw error;
});
