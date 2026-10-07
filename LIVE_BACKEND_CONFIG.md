# Live backend connection

The frontend now polls one endpoint every 5 seconds:

`GET /dashboard/readings`

## Change the Cloudflare Tunnel URL

Edit:

`js/backend-config.js`

Change only:

`DEFAULT_API_BASE_URL`

Current value:

`https://hampton-photos-cheapest-advise.trycloudflare.com`

Example:

```js
const DEFAULT_API_BASE_URL = 'https://YOUR-NEW-TUNNEL.trycloudflare.com';
```

No other frontend file needs the tunnel URL.

## Runtime behavior

- The frontend fetches the dashboard payload immediately on load.
- It polls the same endpoint every 5 seconds.
- The dashboard and ML horizon controller consume the live backend payload.
- The old client-side prediction fallback is no longer used by the normal ML request path.
