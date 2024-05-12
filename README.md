# ephemeral-video

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 12.0.3.

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The app will automatically reload if you change any of the source files.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

To import last local version of ephemeral-webrtc :
ephemeral-video$ `ng cache clean`
ephemeral-video$ `npm install ../ephemeral-webrtc/ephemeral-webrtc-1.0.0.tgz`

Then `npm run build` or `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

## config

src/app.config.json

"ephemeralServerUrl": "https://ephemeral",
OR
"ephemeralServerUrl": "https://localhost:3077",
"ephemeralServerUrl": "http://93.24.136.95:3077",


## angular.json with baseHref

```json
{
    "$schema": "./node_modules/@angular/cli/lib/config/schema.json",
    "version": 1,
    "newProjectRoot": "projects",
    "projects": {
        "ephemeral-video": {
            ...
            "architect": {
                "build": {
                    "builder": "@angular-devkit/build-angular:browser",
                    "options": {
                        "baseHref": "/ephemeral-video/",
                        "OR": "OR",
                        "baseHref": "/",
```

## Run

`npm run start`

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via a platform of your choice. To use this command, you need to first add a package that implements end-to-end testing capabilities.

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.io/cli) page.

## Deploy to 'docs' (for github pages deployment)

ng build --configuration production --output-path docs --base-href /ephemeral-video/
cp docs/index.html docs/404.html
git add docs/\*
git status
git commit -a -m "deploy"
git push origin main

## Roadmap

- DONE(2023/12/26) broadcast ability in ephemeral-webrtc library to support data streaming to all peers having subscribed to one stream
- DONE(2024/05/09): rework broadcast to avoid using ephemeral-server. Actually sendData to publisher, that forwards it to subscribers
- WIP pointer sharing
    - DONE pointer sharing, managing 'cover' and 'none' display modes on both sides.
    - multiple colors pointers
    - add nickname on pointers
- read https://www.webrtc-experiment.com/webrtcpedia/
  Vp8 codec minimum bandwidth is 100kbits/s
  Vp8 codec maximum bandwidth is 2000+ kbits/s
      720p at 30 FPS causes 1.0-to-2.0 Mbps bandwidth usage
      360p at 30 FPS causes 0.5-to-1.0 Mbps bandwidth usage
      180p at 30 FPS causes 0.1-to-0.5 Mbps bandwidth usage

- https://webrtc.github.io/samples/src/content/peerconnection/bandwidth/
  https://github.com/webrtc/samples/blob/gh-pages/src/content/peerconnection/bandwidth/js/main.js
- DONE remote control flashlight when available
- DONE exchange stream capabilities between publisher and subscribers, not going through ephemeral server
- DONE screen sharing
- DONE(2024/05/10) dark theming
    - created a dark-theme
- DONE(2024/05/10) snapshot button spinner
- ability to select a main display stream, and get back to the grid
    - maybe use https://vasily-ivanov.medium.com/instanceof-in-angular-html-templates-63f23d497242 to check instanceof Local or Remote Stream ? 
- manage multiple streams grid ? or not, maybe we should stick to a max of 3 or 4 streams and manage this properly at least.
- DONE manage log level as a url parameter
- DONE manage monitoring mode as a url parameter
- exhange nicknames without using ephemeral-server
- work on blur with https://developers.google.com/mediapipe/solutions/vision/interactive_segmenter/web_js maybe ?
    - and https://www.youtube.com/watch?v=yuUbVQdTRZQ ?
- DONE add snackabr indicating link was copied to clipboard

## BUILD SIZE
