#!/bin/sh
# Open a page in a throwaway Firefox profile (visible window: headless Firefox
# has no WebGPU adapter) and print what it POSTs to a local log server.
# Usage: scripts/firefox-check.sh <url> [timeout-seconds]
URL="$1"; TIMEOUT="${2:-40}"; DIR=/tmp/symdjs-ff
mkdir -p "$DIR/prof"
printf 'user_pref("dom.webgpu.enabled", true);\nuser_pref("browser.shell.checkDefaultBrowser", false);\n' > "$DIR/prof/user.js"
: > "$DIR/log.txt"
node -e '
const http=require("http"),fs=require("fs");
http.createServer((q,r)=>{r.setHeader("Access-Control-Allow-Origin","*");r.setHeader("Access-Control-Allow-Headers","*");
if(q.method==="OPTIONS")return r.end();let b="";q.on("data",c=>b+=c);q.on("end",()=>{fs.appendFileSync(process.argv[1]+"/log.txt",b+"\n");r.end("ok")})}).listen(5199)' "$DIR" &
SERVER=$!
/Applications/Firefox.app/Contents/MacOS/firefox --no-remote --profile "$DIR/prof" "$URL" >/dev/null 2>&1 &
for i in $(seq 1 "$TIMEOUT"); do sleep 1; grep -q "DONE\|ERROR" "$DIR/log.txt" 2>/dev/null && break; done
cat "$DIR/log.txt"
pkill -f "firefox --no-remote --profile $DIR/prof"
kill $SERVER 2>/dev/null
