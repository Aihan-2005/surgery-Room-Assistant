This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Case history and notifications

Home and Cases combine this installation's authenticated server history with
device records, newest first. Local drafts and pending uploads take precedence
over matching server records. Server-only records display read-only metadata
and an authenticated photo gallery. Uploaded local cases also offer their
server gallery, opening automatically if no local photos remain. Photos load
as they approach the viewport, with retry controls for failed downloads.
Tokens stay in headers; images use temporary blob URLs that are released when
the gallery closes. This does not restore photo blobs or consent records into device storage.
Offline, local records remain available. Clearing installation credentials or
using a different installation does not grant access to the previous device's cases.

On iPhone, open the HTTPS app from its Home Screen icon before enabling push.
The app prepares its service worker and server key in advance, then calls
`pushManager.subscribe()` directly from the enable button's click handler.
Automatic reconnects only bind existing subscriptions. If preparation has not
finished when tapped, the app asks for a second tap instead of subscribing
outside the user gesture. The UI distinguishes installation, HTTPS, worker,
server, and browser subscription failures. The server still needs valid VAPID
configuration and access to the browser's push service.

Background sync reminders check IndexedDB again before displaying. Every
received Web Push displays a generic notification, as Safari requires, with
neutral wording when no uploads remain. Push tests use their own message/tag.

Run `npm test`, `npm run lint`, and `npm run build` for regression checks.
If Turbopack cannot bind its helper port in a restricted environment,
`npm run build -- --webpack` provides a production build through Webpack.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
