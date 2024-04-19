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

- DONE(2023/12/26) broadcast ability in ephemeral-video library to support data streaming to all peers having subscribed to one stream
- multiple colors pointers
- try ServiceWorker onbeforeunload to cleanup firebase database https://stackoverflow.com/questions/36379155/wait-for-promises-in-onbeforeunload

- read https://www.webrtc-experiment.com/webrtcpedia/
  Vp8 codec minimum bandwidth is 100kbits/s
  Vp8 codec maximum bandwidth is 2000+ kbits/s

      720p at 30 FPS causes 1.0-to-2.0 Mbps bandwidth usage
      360p at 30 FPS causes 0.5-to-1.0 Mbps bandwidth usage
      180p at 30 FPS causes 0.1-to-0.5 Mbps bandwidth usage

- https://webrtc.github.io/samples/src/content/peerconnection/bandwidth/
  https://github.com/webrtc/samples/blob/gh-pages/src/content/peerconnection/bandwidth/js/main.js

## BUILD SIZE
