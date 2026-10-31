// Forkast page reader: an optional Google Apps Script web app that opens recipe pages for Forkast.
// Some sites (Allrecipes, Serious Eats, Simply Recipes…) block the free reader Forkast uses by default.
// This runs under your own Google account instead, and returns only what Forkast needs from the page
// (its recipe data, title, photo and plain text), not the page itself.
//
// Set up: script.google.com → New project → paste this file → Deploy → New deployment → type "Web app",
// Execute as "Me", Who has access "Anyone" → Deploy, approve access, and copy the web app URL
// (ending in /exec) into READER_URL in web/app.js.

function doGet(e) {
  var url = String((e && e.parameter && e.parameter.url) || "");
  if (!/^https?:\/\/[^\s]+$/i.test(url)) return reply({ error: "Give a web link that starts with http:// or https://" });
  try {
    var res = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true, followRedirects: true,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", "Accept-Language": "en-US,en;q=0.9" }
    });
    var html = res.getContentText();
    var ld = [], re = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi, m;
    while ((m = re.exec(html))) ld.push(m[1]);
    var meta = function (p) { var x = html.match(new RegExp("<meta[^>]+(?:property|name)=[\"']" + p + "[\"'][^>]*content=[\"']([^\"']*)", "i")); return x ? x[1] : ""; };
    var t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    var text = html.replace(/<(script|style|noscript|svg|head|nav|footer)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<li\b[^>]*>/gi, "\n• ").replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr|h\d)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").slice(0, 100000);
    return reply({ status: res.getResponseCode(), title: meta("og:title") || (t ? t[1].trim() : ""), image: meta("og:image"), ld: ld, text: text });
  } catch (err) {
    return reply({ error: String(err && err.message || err) });
  }
}

function reply(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
