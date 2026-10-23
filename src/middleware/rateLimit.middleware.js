const buckets = new Map()

function rateLimit({ windowMs, max, message }) {
    return (req, res, next) => {
        const key = req.ip || req.socket.remoteAddress || "unknown"
        const now = Date.now()
        let bucket = buckets.get(key)
        if (!bucket || bucket.resetAt <= now) bucket = { count: 0, resetAt: now + windowMs }
        bucket.count += 1
        buckets.set(key, bucket)
        if (buckets.size > 10000) {
            for (const [storedKey, storedBucket] of buckets) if (storedBucket.resetAt <= now) buckets.delete(storedKey)
        }
        res.setHeader("RateLimit-Limit", max)
        res.setHeader("RateLimit-Remaining", Math.max(0, max - bucket.count))
        res.setHeader("RateLimit-Reset", Math.ceil(bucket.resetAt / 1000))
        if (bucket.count > max) {
            res.setHeader("Retry-After", Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)))
            return res.status(429).json({ message })
        }
        return next()
    }
}

module.exports = { rateLimit }
