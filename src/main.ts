import { APP_INITIALIZER, enableProdMode, importProvidersFrom } from '@angular/core';

import { bootstrapApplication } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { setLogLevel as setEphClientLogLevel } from 'ephemeral-client';
import { Configuration, initialize as initializeEphWebRtc, setLogLevel as setEphWebRtcLogLevel } from 'ephemeral-webrtc';

import { HttpClient, provideHttpClient } from '@angular/common/http';
import { Observable } from 'rxjs/internal/Observable';
import { tap } from 'rxjs/operators';
import { AppRoutingModule } from './app/app-routing.module';
import { AppComponent } from './app/app.component';
import { WINDOW_PROVIDERS } from './app/windows-provider';
import { environment } from './environments/environment';
import { setLogLevel } from './logLevel';

const logLevel = 'warn';

setLogLevel(logLevel)
setEphClientLogLevel(logLevel)
setEphWebRtcLogLevel(logLevel)

if (environment.production) {
  enableProdMode();
}

function initializeAppFactory(httpClient: HttpClient): () => Observable<any> {
  return () => httpClient.get<Configuration>('app.config.json').pipe(
    tap(config => {
      initializeEphWebRtc(config)
    })
  );
}

bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient(),
    {
      provide: APP_INITIALIZER,
      useFactory: initializeAppFactory,
      multi: true,
      deps: [HttpClient],
    },
    importProvidersFrom(AppRoutingModule),
    WINDOW_PROVIDERS,
    // AuthGuard,
    // provideAnimations() removed to reduce bundle size
    provideNoopAnimations()
  ]
}).catch(err => console.error(err));
