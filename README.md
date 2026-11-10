# Nonogram Solver

A free, browser-based Nonogram / Picross solver for grids from 5×5 through 25×25. Astro generates the English homepage as static HTML. A Web Worker solves clues locally; no account, database, API, or server-side solver is required.

## Local development

Requires Node.js 20.19+ (Node 22 is recommended).

```sh
npm install
npm run dev
```

Open the local URL printed by Astro. On Windows PowerShell systems that block `npm.ps1`, use `npm.cmd` instead of `npm`.

## Test and build

```sh
npm test
npm run check
npm run build
npm run verify:build
npm run preview
```

The build writes `dist/index.html`, plus static assets, `robots.txt`, and `sitemap.xml`. The HTML includes the title, headings, explanatory content, FAQ, and JSON-LD without client-side rendering.

The FAQ JSON-LD mirrors visible answers. Google discontinued FAQ rich results in 2026, so this markup should not be expected to create a special search appearance. No ratings or reviews are fabricated for the WebApplication markup.

## Cloudflare Pages deployment

1. Connect the GitHub repository `xiaoguizi87/nonogram-solver` in **Workers & Pages → Pages → Import an existing Git repository**.
2. Set the production branch to `main`, build command to `npm run build`, and build output directory to `dist`. Use Node.js 22 if your Pages project requires an explicit Node version.
3. In the Pages project, add `nonogramsolver.app` as a custom domain and set the required DNS records using Cloudflare's instructions. Set `www.nonogramsolver.app` to redirect to the canonical root URL if you also use `www`.
4. After deployment, check `https://nonogramsolver.app/`, `/robots.txt`, and `/sitemap.xml`, then submit the sitemap in Google Search Console.

Pushing to the connected production branch triggers a Pages build and deployment. This project uses Astro static output and does not require a Cloudflare Worker adapter or `wrangler deploy`.

## Solver behavior

The solver generates line patterns, propagates row and column constraints, and branches when propagation alone cannot decide the grid. It searches for up to two valid grids to distinguish a unique solution from multiple solutions. The default safeguards are 8 seconds, 20,000 search nodes, and 200,000 candidates per line. Reaching a safeguard reports a limit, never an unproven No Solution or Unique Solution. The browser can cancel work by terminating the Worker.
