async function cdpEval(targetId, expression) {
  const version = await (await fetch("http://127.0.0.1:9222/json/version")).json();

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(version.webSocketDebuggerUrl);

    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("CDP timeout"));
    }, 15000);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        id: 1,
        method: "Target.attachToTarget",
        params: { targetId, flatten: true }
      }));
    };

    ws.onmessage = e => {
      const r = JSON.parse(e.data);

      if (r.id === 1) {
        ws.send(JSON.stringify({
          id: 2,
          sessionId: r.result.sessionId,
          method: "Runtime.evaluate",
          params: {
            expression,
            returnByValue: true,
            awaitPromise: true
          }
        }));
        return;
      }

      if (r.id === 2) {
        clearTimeout(timer);
        ws.close();

        if (r.error) {
          reject(new Error(r.error.message));
          return;
        }

        resolve(r.result?.result?.value);
      }
    };

    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error("CDP websocket error"));
    };
  });
}

function parseFacebookWatchMessages(text, groupUrl) {
  const lines = String(text || "").split(/\r?\n/);

  return lines
    .filter(line => /^Enter, Message sent .+ by .+:.+/.test(line))
    .map((line, index) => {
      const m = line.match(/^Enter, Message sent .+ by ([^:]+):\s*(.+)$/);
      if (!m) return null;

      const seller = m[1].trim();
      const body = m[2].trim();

      const reference =
        body.match(/\b\d{5,6}[A-Z]{0,4}\b/i)?.[0]?.toUpperCase();

      if (!reference) return null;

      return {
        id: `facebook-${reference}-${seller}-${index}`,
        source: "Facebook",
        seller,
        reference,
        title: body,
        listingText: body,
        url: groupUrl,
        capturedAt: new Date().toISOString()
      };
    })
    .filter(Boolean);
}

export async function getFacebookDirect(groupFragment) {
  const targets = await (
    await fetch("http://127.0.0.1:9222/json/list")
  ).json();

  const target = targets.find(t =>
    t.type === "page" &&
    t.url?.includes("facebook.com/groups/") &&
    (!groupFragment ||
      t.url.toLowerCase().includes(groupFragment.toLowerCase()))
  );

  if (!target?.id) {
    throw new Error(`Facebook group target not found: ${groupFragment}`);
  }

  const text = await cdpEval(
    target.id,
    `(() => (document.body?.innerText || "").trim())()`
  );

  const posts = parseFacebookWatchMessages(text, target.url);

  console.log(
    `DIRECT FACEBOOK ${groupFragment}: ${posts.length} watch listings`
  );

  return posts;
}
