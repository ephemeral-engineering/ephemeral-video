import { enableProdMode, importProvidersFrom } from '@angular/core';

import { bootstrapApplication } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { setLogLevel as setEphClientRtcLogLevel } from 'ephemeral-client';
import { setLogLevel as setEphWebRtcLogLevel } from 'ephemeral-webrtc';

import { AppRoutingModule } from './app/app-routing.module';
import { AppComponent } from './app/app.component';
import { AuthGuard } from './app/auth.guard';
import { WINDOW_PROVIDERS } from './app/windows-provider';
import { environment } from './environments/environment';
import { setLogLevel } from './logLevel';

const logLevel = 'info';

setLogLevel('debug')
setEphClientRtcLogLevel('info')
setEphWebRtcLogLevel('info')

if (environment.production) {
  enableProdMode();
}

bootstrapApplication(AppComponent, {
  providers: [
    importProvidersFrom(AppRoutingModule),
    WINDOW_PROVIDERS, AuthGuard,
    // provideAnimations() removed to reduce bundle size
    provideNoopAnimations()
  ]
}).catch(err => console.error(err));
