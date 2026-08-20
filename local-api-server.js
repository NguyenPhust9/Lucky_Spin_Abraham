const http = require("http");

const zaloPhoneVerify = require("./api/zalo-phone-verify");

const PORT = 3000;

const server = http.createServer((req, res) => {
  const pathname = (req.url || "").split("?")[0];

  if (pathname !== "/api/zalo-phone-verify") {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(
      JSON.stringify({
        ok: false,
        message: "Not found"
      })
    );
  }

  let rawBody = "";

  req.on("data", (chunk) => {
    rawBody += chunk;
  });

  req.on("end", async () => {
    if (rawBody) {
      try {
        req.body = JSON.parse(rawBody);
      } catch {
        req.body = rawBody;
      }
    } else {
      req.body = {};
    }

    try {
      await zaloPhoneVerify(req, res);
    } catch (error) {
      console.error("[LOCAL API ERROR]", error);

      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
      }

      if (!res.writableEnded) {
        res.end(
          JSON.stringify({
            ok: false,
            message: error.message || "Local server error"
          })
        );
      }
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log("========================================");
  console.log(" Abraham Local Zalo API is running");
  console.log(` http://localhost:${PORT}`);
  console.log("========================================");
  console.log("");
});