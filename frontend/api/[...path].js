const hopByHopHeaders = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
])

export default async function handler(req, res) {
  const backendUrl = process.env.BACKEND_URL
  if (!backendUrl) {
    return res.status(503).json({ message: "The API service is not configured" })
  }

  try {
    const headers = new Headers()
    for (const [name, value] of Object.entries(req.headers)) {
      if (value && !hopByHopHeaders.has(name.toLowerCase())) {
        headers.set(name, Array.isArray(value) ? value.join(", ") : value)
      }
    }

    const chunks = []
    for await (const chunk of req) chunks.push(Buffer.from(chunk))
    const body = Buffer.concat(chunks)
    const method = req.method || "GET"
    const response = await fetch(new URL(req.url, backendUrl), {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : body,
    })

    res.statusCode = response.status
    response.headers.forEach((value, name) => {
      if (name.toLowerCase() !== "set-cookie" && !hopByHopHeaders.has(name.toLowerCase())) {
        res.setHeader(name, value)
      }
    })
    const cookies = response.headers.getSetCookie?.() || []
    if (cookies.length) res.setHeader("Set-Cookie", cookies)
    return res.end(Buffer.from(await response.arrayBuffer()))
  } catch (error) {
    console.error("API proxy failed:", error.message)
    return res.status(502).json({ message: "The API service is unavailable" })
  }
}
