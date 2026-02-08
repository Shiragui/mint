# MINT

Entertainment media scanner: select a region on any page (e.g. YouTube, shows), get a vision description and similar products, **save items** to your list, and review them on the website.

## Stack

- **mint-extension/** — Chrome extension (capture area → analyze → save).
- **backend/** — FastAPI: `POST /analyze` (Dedalus vision + product suggestions), `POST /items`, `GET /items`.
- **web/** — Next.js dashboard: login with token, view saved items.

## Quick start

Go to mintgreen.netlify.app to create an account and view other people's posted boards.

In Chrome go to `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, select the `mint-extension` folder.

Click the  extension to log into your account to start saving. Uses the icon on the bottom right of the screen to access the selection feature to choose the object you'd like to analyze.

For the extension to work, input API keys into `config.js` in `mint-extension`.


## Project plan

See [BUILD_GUIDE.md](./BUILD_GUIDE.md) for architecture, Dedalus ADK + Auth integration, phased plan, and team roles.
