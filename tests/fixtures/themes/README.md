# Theme fixtures

Two lab themes for the build tests and the e2e suite (`LINKEDIA_THEMES_DIR=tests/fixtures/themes`): `lab-2099-w01` (previous slot, CSS only, light) and `lab-2099-w02` (current slot, with an enhancement module that needs motion and WebGL; headless Chromium has no WebGL, so `e2e/themes.spec.mjs` gives pages a stand-in context except in its no-WebGL test). They are never deployed.
